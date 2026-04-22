import { SignJWT, jwtVerify } from "jose";
import type { KeyLike } from "jose";
import type { VCDocument } from "./builder.js";
import { KEY_ID } from "./keys.js";

interface VCJWTPayload {
  iss: string;
  sub: string;
  iat: number;
  vc: VCDocument;
}

export async function signVC(
  vcDocument: VCDocument,
  privateKey: CryptoKey,
): Promise<string> {
  return new SignJWT({ vc: vcDocument } as Record<string, unknown>)
    .setProtectedHeader({ alg: "EdDSA", kid: KEY_ID })
    .setIssuer(vcDocument.issuer.id)
    .setSubject(vcDocument.credentialSubject.id)
    .setIssuedAt()
    .sign(privateKey as unknown as KeyLike);
}

export async function verifyVC(
  jws: string,
  publicKey: CryptoKey,
): Promise<VCDocument> {
  const { payload } = await jwtVerify<VCJWTPayload>(
    jws,
    publicKey as unknown as KeyLike,
    { algorithms: ["EdDSA"] },
  );
  if (!payload.vc) {
    throw new Error("JWT payload missing 'vc' claim");
  }
  return payload.vc;
}
