import type { VerifiableCredentialSubject } from "@pedagogue/shared";

export interface VCCredentialStatus {
  id: string;
  type: "StatusList2021Entry";
  statusPurpose: "revocation";
  statusListIndex: string;
  statusListCredential: string;
}

export interface VCDocument {
  "@context": string[];
  id: string;
  type: string[];
  issuer: { id: string; name: string };
  validFrom: string;
  credentialSubject: VerifiableCredentialSubject & { id: string };
  credentialStatus?: VCCredentialStatus;
  proof?: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    jws: string;
  };
}

export function buildVC(
  subject: VerifiableCredentialSubject,
  sessionId: string,
  statusListIndex?: number,
  statusListId = "default",
): VCDocument {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://pedagogue.app";

  const credentialStatus: VCCredentialStatus | undefined =
    statusListIndex !== undefined
      ? {
          id: `${appUrl}/api/credential/status/${statusListId}#${statusListIndex}`,
          type: "StatusList2021Entry",
          statusPurpose: "revocation",
          statusListIndex: String(statusListIndex),
          statusListCredential: `${appUrl}/api/credential/status/${statusListId}`,
        }
      : undefined;

  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://pedagogue.app/schemas/v1",
    ],
    id: `${appUrl}/credential/${sessionId}`,
    type: ["VerifiableCredential", "PedagogueCompletionCredential"],
    issuer: {
      id: `${appUrl}/issuer`,
      name: "Pedagogue",
    },
    validFrom: new Date().toISOString(),
    credentialSubject: { ...subject, id: `urn:session:${sessionId}` },
    ...(credentialStatus ? { credentialStatus } : {}),
  };
}
