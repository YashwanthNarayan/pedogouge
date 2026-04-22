import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function createServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

export function createCookieClient(): SupabaseClient {
  const cookieStore = cookies();
  return createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try { for (const { name, value, options } of list) cookieStore.set(name, value, options); }
        catch { /* Server Component context — no-op */ }
      },
    },
  }) as unknown as SupabaseClient;
}

export interface TeacherContext {
  userId: string;
  classIds: string[];
  supabase: SupabaseClient;
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(msg: string) { super(msg); this.name = "ForbiddenError"; }
}
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(msg: string) { super(msg); this.name = "UnauthorizedError"; }
}

/**
 * Validates the caller is a teacher, returns their userId + owned classIds.
 * Throws ForbiddenError / UnauthorizedError — route handlers catch and respond.
 */
export async function requireTeacher(
  bearerToken: string | null,
): Promise<TeacherContext> {
  if (!bearerToken) throw new UnauthorizedError("Missing Authorization header");

  // Verify JWT against Supabase
  const svc = createServiceClient();
  const { data: { user }, error } = await svc.auth.getUser(bearerToken);
  if (error || !user) throw new UnauthorizedError("Invalid or expired token");

  // Confirm role = teacher in users table
  const { data: userRow, error: uErr } = await svc
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (uErr || !userRow) throw new UnauthorizedError("User record not found");
  if ((userRow.role as string) !== "teacher")
    throw new ForbiddenError("This endpoint requires the teacher role");

  // Fetch class_ids this teacher owns
  const { data: memberships } = await svc
    .from("class_memberships")
    .select("class_id")
    .eq("user_id", user.id)
    .in("role", ["teacher", "ta"]);

  const classIds = (memberships ?? []).map((m: { class_id: string }) => m.class_id);

  return { userId: user.id, classIds, supabase: svc };
}

/** Extracts Bearer token from Authorization header */
export function extractBearer(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

/** Returns a NextResponse error for caught auth errors */
export function authErrorResponse(err: unknown): NextResponse {
  if (err instanceof ForbiddenError)
    return NextResponse.json({ error: err.message }, { status: 403 });
  if (err instanceof UnauthorizedError)
    return NextResponse.json({ error: err.message }, { status: 401 });
  throw err; // unexpected — let Next.js handle
}
