import { jwtVerify, importJWK, type KeyLike, type JWK } from "jose";

type JWKSCache = { keys: JWK[]; fetchedAt: number };
const JWKS_TTL_MS = 24 * 60 * 60 * 1_000; // 24 hours

// In-memory cache — persists for the app session, fetched fresh on cold start
let _cache: JWKSCache | null = null;

async function _fetchPublicKey(apiUrl: string): Promise<KeyLike> {
  if (_cache && Date.now() - _cache.fetchedAt < JWKS_TTL_MS) {
    const sigKey = _cache.keys.find((k) => k["use"] === "sig" && k["alg"] === "EdDSA");
    if (sigKey) return importJWK(sigKey, "EdDSA") as Promise<KeyLike>;
  }

  const url = apiUrl.replace(/\/$/, "");
  const res  = await fetch(`${url}/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);

  const jwks = (await res.json()) as { keys: JWK[] };
  _cache = { keys: jwks.keys, fetchedAt: Date.now() };

  const sigKey = jwks.keys.find((k) => k["use"] === "sig" && k["alg"] === "EdDSA");
  if (!sigKey) throw new Error("No EdDSA signing key in JWKS");

  return importJWK(sigKey, "EdDSA") as Promise<KeyLike>;
}

export type VerifyResult = {
  valid: boolean;
  subject?: unknown;
  error?: string;
};

export async function verifyCredentialOffline(
  jwt: string,
  apiUrl: string,
): Promise<VerifyResult> {
  try {
    const publicKey        = await _fetchPublicKey(apiUrl);
    const { payload }      = await jwtVerify(jwt, publicKey, { algorithms: ["EdDSA"] });
    return { valid: true, subject: payload };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}
