import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SignJWT, jwtVerify } from "jose";
import { ExtensionTokenRequest, ExtensionTokenResponse } from "@pedagogue/shared";
import crypto from "node:crypto";

const JWT_SECRET = process.env.JWT_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function sha256Base64url(input: string): string {
  return crypto
    .createHash("sha256")
    .update(input)
    .digest("base64url");
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ExtensionTokenRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { state, code, verifier } = parsed.data;

  // Retrieve the pending OAuth state record
  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: pending, error: fetchErr } = await svc
    .from("pending_oauth_states")
    .select("code_challenge, pedagogue_token, user_id, expires_at")
    .eq("state", state)
    .single();

  if (fetchErr || !pending) {
    return NextResponse.json({ error: "invalid_state" }, { status: 401 });
  }

  // Check expiry
  if (new Date(pending.expires_at as string) < new Date()) {
    await svc.from("pending_oauth_states").delete().eq("state", state);
    return NextResponse.json({ error: "state_expired" }, { status: 401 });
  }

  // Validate PKCE: sha256(verifier) must match stored challenge
  const computedChallenge = sha256Base64url(verifier);
  if (computedChallenge !== pending.code_challenge) {
    return NextResponse.json({ error: "pkce_verification_failed" }, { status: 401 });
  }

  // Verify the short-lived code matches what we issued
  const secret = new TextEncoder().encode(JWT_SECRET);
  let userId: string;
  try {
    const { payload } = await jwtVerify(code, secret);
    if (payload.sub !== (pending.user_id as string)) {
      return NextResponse.json({ error: "token_user_mismatch" }, { status: 401 });
    }
    userId = payload.sub;
  } catch {
    return NextResponse.json({ error: "invalid_code" }, { status: 401 });
  }

  // Consume the state row (one-time use)
  await svc.from("pending_oauth_states").delete().eq("state", state);

  // Issue a long-lived session token (30 days)
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const sessionToken = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret);

  const response = ExtensionTokenResponse.parse({
    sessionToken,
    userId,
    expiresAt,
  });

  return NextResponse.json(response);
}
