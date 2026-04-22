import { SignJWT, jwtVerify, type KeyLike } from "jose";

export interface EditPayload {
  filePath: string;
  originalLine: string;
  patchedLine: string;
  sessionId: string;
  issuedAt: number;
}

/**
 * Sign an edit payload with the server's Ed25519 private key.
 * Uses the same keypair as the credential system (T3-18).
 * Returns a compact EdDSA JWS.
 */
export async function signEdit(
  edit: Omit<EditPayload, "issuedAt">,
  privateKey: CryptoKey,
): Promise<string> {
  return new SignJWT(edit as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuedAt()
    .setExpirationTime("5m") // edits stale after 5 min; extension must apply promptly
    .sign(privateKey as unknown as KeyLike);
}

/**
 * Verify and decode a signed edit JWT.
 * Throws if signature invalid or token expired.
 */
export async function verifyEdit(
  jwt: string,
  publicKey: CryptoKey,
): Promise<EditPayload> {
  const { payload } = await jwtVerify(jwt, publicKey as unknown as KeyLike, {
    algorithms: ["EdDSA"],
  });

  const { filePath, originalLine, patchedLine, sessionId, iat } = payload as Record<string, unknown>;

  if (
    typeof filePath !== "string" ||
    typeof originalLine !== "string" ||
    typeof patchedLine !== "string" ||
    typeof sessionId !== "string"
  ) {
    throw new Error("Edit JWT payload missing required fields");
  }

  return {
    filePath,
    originalLine,
    patchedLine,
    sessionId,
    issuedAt: (iat as number) * 1000,
  };
}
