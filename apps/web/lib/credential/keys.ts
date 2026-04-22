import {
  generateKeyPair,
  exportJWK as joseExportJWK,
  importJWK as joseImportJWK,
  type KeyLike,
  type JWK,
} from "jose";

export const KEY_ID = "pedagogue-ed25519-v1";

export async function generateKeypair(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}> {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
    crv: "Ed25519",
    extractable: true,
  });
  return {
    privateKey: privateKey as unknown as CryptoKey,
    publicKey: publicKey as unknown as CryptoKey,
  };
}

export async function exportJWK(key: CryptoKey): Promise<JsonWebKey> {
  return joseExportJWK(key as unknown as KeyLike);
}

export async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  const key = await joseImportJWK({ ...jwk, alg: "EdDSA" } as unknown as JWK, "EdDSA");
  return key as unknown as CryptoKey;
}

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  const key = await joseImportJWK({ ...jwk, alg: "EdDSA" } as unknown as JWK, "EdDSA");
  return key as unknown as CryptoKey;
}

// Lazy singleton — loaded from env vars once per process
let _cached: { privateKey: CryptoKey; publicKey: CryptoKey } | null = null;

export async function getSigningKeys(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  kid: string;
}> {
  if (_cached) return { ..._cached, kid: KEY_ID };

  const privRaw = process.env.CREDENTIAL_PRIVATE_KEY_JWK;
  const pubRaw = process.env.CREDENTIAL_PUBLIC_KEY_JWK;

  if (!privRaw || !pubRaw) {
    throw new Error(
      "CREDENTIAL_PRIVATE_KEY_JWK / CREDENTIAL_PUBLIC_KEY_JWK env vars not set. " +
        "Run pnpm credential:keygen to create a keypair.",
    );
  }

  _cached = {
    privateKey: await importPrivateKey(JSON.parse(privRaw) as JsonWebKey),
    publicKey: await importPublicKey(JSON.parse(pubRaw) as JsonWebKey),
  };
  return { ..._cached, kid: KEY_ID };
}
