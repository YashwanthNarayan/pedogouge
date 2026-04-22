import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSigningKeys, KEY_ID } from "@/lib/credential/keys";
import { verifyVC } from "@/lib/credential/sign";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = getServiceClient();
  const { id } = await params;

  const { data: cred, error } = await supabase
    .from("credentials")
    .select("id, jwt, issued_at, revoked_at, revocation_reason")
    .eq("id", id)
    .single();

  if (error || !cred) {
    return NextResponse.json({ valid: false, reason: "Not found" }, { status: 404 });
  }

  if (cred.revoked_at) {
    return NextResponse.json({
      valid: false,
      reason: cred.revocation_reason ?? "Revoked",
    });
  }

  try {
    const { publicKey } = await getSigningKeys();
    await verifyVC(cred.jwt as string, publicKey);

    await supabase.from("credential_audit").insert({
      credential_id: cred.id,
      action: "verified",
      signer_kid: KEY_ID,
    });

    return NextResponse.json({ valid: true });
  } catch {
    await supabase.from("credential_audit").insert({
      credential_id: cred.id,
      action: "verify_failed",
      signer_kid: KEY_ID,
    });

    return NextResponse.json({ valid: false, reason: "Signature invalid" });
  }
}
