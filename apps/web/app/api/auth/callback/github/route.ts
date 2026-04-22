import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { z } from "zod";

const CallbackQuery = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  code_challenge: z.string().min(1),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";
const JWT_SECRET = process.env.JWT_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function errorRedirect(msg: string) {
  const url = new URL("/auth/extension", APP_URL);
  url.searchParams.set("error", msg);
  return NextResponse.redirect(url.toString());
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const parsed = CallbackQuery.safeParse({
    code: searchParams.get("code"),
    state: searchParams.get("state"),
    // GitHub echoes back extra params we added to the auth URL
    code_challenge: searchParams.get("code_challenge"),
  });

  if (!parsed.success) {
    return errorRedirect("invalid_callback_params");
  }

  const { code, state, code_challenge } = parsed.data;

  // Exchange code for GitHub access token (server-side only — secret stays safe)
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${APP_URL}/api/auth/callback/github`,
    }),
  });

  if (!tokenRes.ok) return errorRedirect("github_token_exchange_failed");

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!tokenJson.access_token) return errorRedirect("github_no_access_token");

  // Fetch GitHub user
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!userRes.ok) return errorRedirect("github_user_fetch_failed");
  const ghUser = (await userRes.json()) as { id: number; login: string; email: string | null };

  // Fetch verified primary email if not in user object
  let email = ghUser.email;
  if (!email) {
    const emailRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (emailRes.ok) {
      const emails = (await emailRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      email = emails.find((e) => e.primary && e.verified)?.email ?? null;
    }
  }
  if (!email) return errorRedirect("github_no_verified_email");

  // Upsert user into Supabase (service role bypasses RLS)
  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: existingUser } = await svc
    .from("users")
    .select("id")
    .eq("github_id", String(ghUser.id))
    .single();

  let userId: string;
  if (existingUser) {
    userId = existingUser.id as string;
  } else {
    // Create Supabase auth user and users row
    const { data: authUser, error: authErr } = await svc.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { github_login: ghUser.login },
    });
    if (authErr) return errorRedirect("supabase_user_create_failed");
    userId = authUser.user!.id;

    const { error: upsertErr } = await svc.from("users").insert({
      id: userId,
      email,
      github_id: String(ghUser.id),
      display_name: ghUser.login,
      role: "student",
      birthdate: "2000-01-01", // placeholder; age gate enforced at enrollment
    });
    if (upsertErr) return errorRedirect("db_user_insert_failed");
  }

  // Mint a short-lived Pedagogue token (15 min) — extension exchanges it via PKCE
  const secret = new TextEncoder().encode(JWT_SECRET);
  const pedagogue_token = await new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret);

  // Store state → { code_challenge, pedagogue_token, user_id } in DB
  const { error: storeErr } = await svc.from("pending_oauth_states").upsert({
    state,
    code_challenge,
    pedagogue_token,
    user_id: userId,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (storeErr) return errorRedirect("state_store_failed");

  // Redirect back to VS Code via custom URI scheme
  const vscodeUri =
    `vscode://pedagogue-tutor/callback?code=${encodeURIComponent(pedagogue_token)}&state=${encodeURIComponent(state)}`;

  return NextResponse.redirect(vscodeUri);
}
