import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { getSigningKeys } from "@/lib/credential/keys";
import { revokeCredential } from "@/lib/credential/revocation";

const RevokeBody = z.object({ credentialId: z.string().uuid() });

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getAuthenticatedTeacher(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) return null;

  const { data: profile } = await getServiceClient()
    .from("users")
    .select("id, role")
    .eq("github_id", user.user_metadata?.provider_id ?? "")
    .single();

  if (profile?.role !== "teacher") return null;
  return profile.id as string;
}

export async function POST(req: NextRequest) {
  // Auth: teacher or service role (service role identified by header)
  const serviceSecret = req.headers.get("x-service-secret");
  const isServiceRole = serviceSecret === process.env.SUPABASE_SERVICE_ROLE_KEY;

  let teacherId: string | null = null;
  if (!isServiceRole) {
    teacherId = await getAuthenticatedTeacher();
    if (!teacherId) {
      return NextResponse.json({ error: "Unauthorized — teacher role required" }, { status: 403 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RevokeBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { credentialId } = parsed.data;
  const supabase = getServiceClient();

  // Fetch the credential + its status list index
  const { data: cred, error: fetchErr } = await supabase
    .from("credentials")
    .select("id, status_list_index, status_list_id, revoked_at")
    .eq("id", credentialId)
    .single();

  if (fetchErr || !cred) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }

  if (cred.revoked_at) {
    return NextResponse.json({ error: "Credential already revoked" }, { status: 409 });
  }

  // Flip the StatusList bit
  if (cred.status_list_index !== null && cred.status_list_index !== undefined) {
    try {
      const { privateKey } = await getSigningKeys();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await revokeCredential(
        cred.status_list_index as number,
        supabase as any,
        privateKey,
        (cred.status_list_id as string) ?? "default",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Revocation signing failed";
      return NextResponse.json({ error: msg }, { status: 503 });
    }
  }

  // Mark the credential revoked
  await supabase
    .from("credentials")
    .update({ revoked_at: new Date().toISOString(), revocation_reason: "Revoked by teacher" })
    .eq("id", credentialId);

  // Audit
  await supabase.from("credential_audit").insert({
    credential_id: credentialId,
    user_id: teacherId,
    action: "revoked",
  });

  return NextResponse.json({ revoked: true });
}
