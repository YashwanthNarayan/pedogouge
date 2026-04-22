import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const JWT_SECRET   = process.env.JWT_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function svc() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    try {
      const { payload } = await jwtVerify(
        auth.slice(7),
        new TextEncoder().encode(JWT_SECRET),
      );
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }
  try {
    const { createCookieClient } = await import("@/lib/teacher/middleware");
    const supabase = await createCookieClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// users table has display_name but no separate `name` column
const PatchUserBody = z.object({
  displayName: z.string().min(1).max(100).optional(),
});

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = svc();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, role, github_id, display_name, created_at")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const u = data as {
    id: string;
    email: string;
    role: string;
    github_id: string | null;
    display_name: string | null;
    created_at: string;
  };

  return NextResponse.json({
    userId: u.id,
    email: u.email,
    role: u.role,
    githubId: u.github_id,
    displayName: u.display_name,
    createdAt: u.created_at,
  });
}

export async function PATCH(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchUserBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { displayName } = parsed.data;

  if (displayName === undefined) {
    return NextResponse.json({ updated: false, reason: "no fields to update" });
  }

  const supabase = svc();
  const { error } = await supabase
    .from("users")
    .update({ display_name: displayName })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: true, displayName });
}
