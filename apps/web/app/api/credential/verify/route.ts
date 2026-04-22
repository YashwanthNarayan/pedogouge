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

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { data: cred, error } = await supabase
    .from("credentials")
    .select("id, jwt, vc_json, issued_at, revoked_at, revocation_reason")
    .eq("id", id)
    .single();

  if (error || !cred) {
    return NextResponse.json(
      { valid: false, reason: "Credential not found" },
      { status: 404 },
    );
  }

  if (cred.revoked_at) {
    return NextResponse.json({
      valid: false,
      reason: cred.revocation_reason ?? "Credential has been revoked",
      issuedAt: cred.issued_at,
    });
  }

  try {
    const { publicKey } = await getSigningKeys();
    const vcDoc = await verifyVC(cred.jwt as string, publicKey);

    await supabase.from("credential_audit").insert({
      credential_id: cred.id,
      action: "verified",
      signer_kid: KEY_ID,
    });

    return NextResponse.json({
      valid: true,
      subject: vcDoc.credentialSubject,
      issuedAt: cred.issued_at,
    });
  } catch {
    await supabase.from("credential_audit").insert({
      credential_id: cred.id,
      action: "verify_failed",
      signer_kid: KEY_ID,
    });

    return NextResponse.json({
      valid: false,
      reason: "Signature verification failed",
    });
  }
}
