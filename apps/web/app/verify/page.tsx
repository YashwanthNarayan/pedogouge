import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { getSigningKeys } from "@/lib/credential/keys";
import { verifyVC } from "@/lib/credential/sign";
import type { VerifiableCredentialSubject } from "@pedagogue/shared";
import VerifyClient from "./verify-client";

// ---------------------------------------------------------------------------
// Exported type consumed by VerifyClient
// ---------------------------------------------------------------------------

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  issuedAt?: string;
  subject?: VerifiableCredentialSubject & { id: string };
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Verify Credential — Pedagogue",
  description:
    "Cryptographically verify a Pedagogue learning credential.",
  robots: { index: false },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Decode a compact JWT payload without verifying (to extract vc.id for lookup)
function extractCredentialIdFromJwt(jwt: string): string | null {
  try {
    const [, payload] = jwt.split(".");
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    const vcId: string | undefined = decoded?.vc?.id;
    if (!vcId) return null;
    // vc.id is `https://pedagogue.app/credential/<uuid>`
    const parts = vcId.split("/");
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
}

async function resolveCredentialResult(id: string): Promise<VerifyResult> {
  const supabase = getServiceClient();
  if (!supabase) {
    return { valid: false, reason: "Service unavailable — check environment configuration" };
  }

  const { data: cred, error } = await supabase
    .from("credentials")
    .select("id, jwt, issued_at, revoked_at, revocation_reason")
    .eq("id", id)
    .single();

  if (error || !cred) {
    return { valid: false, reason: "Credential not found" };
  }

  if (cred.revoked_at) {
    return {
      valid: false,
      reason: (cred.revocation_reason as string) ?? "Credential has been revoked",
      issuedAt: cred.issued_at as string,
    };
  }

  try {
    const { publicKey } = await getSigningKeys();
    const vcDoc = await verifyVC(cred.jwt as string, publicKey);
    return {
      valid: true,
      issuedAt: cred.issued_at as string,
      subject: vcDoc.credentialSubject,
    };
  } catch {
    return { valid: false, reason: "Signature verification failed" };
  }
}

// ---------------------------------------------------------------------------
// Page (server component)
// ---------------------------------------------------------------------------

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; jwt?: string }>;
}) {
  const { id: rawId, jwt: rawJwt } = await searchParams;

  // Resolve credential ID: prefer ?id=, fall back to extracting from ?jwt=
  let credentialId: string | null = rawId ?? null;
  if (!credentialId && rawJwt) {
    credentialId = extractCredentialIdFromJwt(rawJwt);
  }

  if (!credentialId) {
    return <VerifyClient result={null} credentialId={null} />;
  }

  const result = await resolveCredentialResult(credentialId);

  return <VerifyClient result={result} credentialId={credentialId} />;
}
