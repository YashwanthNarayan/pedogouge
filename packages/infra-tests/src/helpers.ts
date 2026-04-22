import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseAvailable =
  SUPABASE_URL !== "" && SERVICE_ROLE_KEY !== "" && ANON_KEY !== "";

/** Service-role client — bypasses RLS, used for setup/teardown */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Returns a client authenticated as the given user.
 * Uses set_config trick to impersonate via service role with custom JWT claims,
 * or creates a real anon client with a Supabase access token if provided.
 */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

/** Creates a test user and returns their access token */
export async function createTestUser(
  svc: SupabaseClient,
  email: string,
  role: "student" | "teacher" = "student",
): Promise<TestUser> {
  const password = "Test1234!";
  // Create auth user
  const { data: authData, error: authErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr) throw new Error(`createUser failed: ${authErr.message}`);
  const userId = authData.user!.id;

  // Upsert into users table
  const { error: upsertErr } = await svc.from("users").upsert({
    id: userId,
    email,
    role,
    birthdate: "2005-01-01",
  });
  if (upsertErr) throw new Error(`users upsert failed: ${upsertErr.message}`);

  // Get access token via sign-in
  const anonSvc = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: signInData, error: signInErr } =
    await anonSvc.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`);

  return { id: userId, email, accessToken: signInData.session!.access_token };
}

/** Deletes test users and all their data via service role */
export async function cleanupTestUser(
  svc: SupabaseClient,
  userId: string,
): Promise<void> {
  await svc.from("users").delete().eq("id", userId);
  await svc.auth.admin.deleteUser(userId);
}
