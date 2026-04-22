import { gzip as nodeGzip, gunzip as nodeGunzip } from "zlib";
import { promisify } from "util";
import { SignJWT } from "jose";
import type { KeyLike } from "jose";
import { KEY_ID } from "./keys.js";

const gzipAsync = promisify(nodeGzip);
const gunzipAsync = promisify(nodeGunzip);

// The minimum StatusList2021 bitstring is 131,072 bits (16 KB) to prevent
// correlation attacks where small lists reveal which credentials were issued.
export const STATUS_LIST_BITS = 131_072;
export const STATUS_LIST_BYTES = STATUS_LIST_BITS / 8; // 16 384
export const DEFAULT_LIST_ID = "default";

// Minimal DB interface for status list operations — avoids Supabase generic hell
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDB = any;

// ---------------------------------------------------------------------------
// Compression helpers (Node.js zlib — runs in Node.js API routes, not edge)
// ---------------------------------------------------------------------------

export async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const result = await gzipAsync(data);
  return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
}

export async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const result = await gunzipAsync(data);
  return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
}

// ---------------------------------------------------------------------------
// Encoding / decoding (base64url + gzip per StatusList2021 spec)
// ---------------------------------------------------------------------------

export async function encodeList(bits: Uint8Array): Promise<string> {
  const compressed = await gzip(bits);
  return Buffer.from(compressed).toString("base64url");
}

export async function decodeList(encoded: string): Promise<Uint8Array> {
  const compressed = Buffer.from(encoded, "base64url");
  return gunzip(new Uint8Array(compressed));
}

function emptyBitstring(): Uint8Array {
  return new Uint8Array(STATUS_LIST_BYTES);
}

// ---------------------------------------------------------------------------
// Bit operations (MSB-first per spec: bit 0 is the MSB of byte 0)
// ---------------------------------------------------------------------------

export function getBit(bits: Uint8Array, index: number): boolean {
  const byteIndex = Math.floor(index / 8);
  const bitOffset = 7 - (index % 8); // MSB first
  return ((bits[byteIndex] ?? 0) & (1 << bitOffset)) !== 0;
}

export function setBit(bits: Uint8Array, index: number): Uint8Array {
  const out = new Uint8Array(bits);
  const byteIndex = Math.floor(index / 8);
  const bitOffset = 7 - (index % 8);
  out[byteIndex] = (out[byteIndex] ?? 0) | (1 << bitOffset);
  return out;
}

// ---------------------------------------------------------------------------
// DB helpers — accept client explicitly for testability
// ---------------------------------------------------------------------------

export async function getOrCreateEncodedList(
  listId: string,
  supabase: AnyDB,
): Promise<string> {
  const { data } = await supabase
    .from("status_lists")
    .select("encoded_list")
    .eq("id", listId)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const existing = data?.encoded_list as string | undefined;
  if (existing) return existing;

  // First use — create the list with an empty bitstring
  const encoded = await encodeList(emptyBitstring());
  await supabase.from("status_lists").insert({
    id: listId,
    purpose: "revocation",
    encoded_list: encoded,
  });
  return encoded;
}

export async function isRevoked(
  credentialIndex: number,
  supabase: AnyDB,
  listId = DEFAULT_LIST_ID,
): Promise<boolean> {
  const encoded = await getOrCreateEncodedList(listId, supabase);
  const bits = await decodeList(encoded);
  return getBit(bits, credentialIndex);
}

export async function revokeCredential(
  credentialIndex: number,
  supabase: AnyDB,
  privateKey: CryptoKey,
  listId = DEFAULT_LIST_ID,
): Promise<void> {
  const encoded = await getOrCreateEncodedList(listId, supabase);
  const bits = await decodeList(encoded);
  const newBits = setBit(bits, credentialIndex);
  const newEncoded = await encodeList(newBits);
  const signedVc = await buildStatusListVC(listId, newEncoded, privateKey);

  await supabase
    .from("status_lists")
    .update({
      encoded_list: newEncoded,
      signed_vc_json: signedVc,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listId);
}

// ---------------------------------------------------------------------------
// StatusList2021 VC construction + signing
// ---------------------------------------------------------------------------

export interface StatusListVCDocument {
  "@context": string[];
  id: string;
  type: string[];
  issuer: { id: string; name: string };
  validFrom: string;
  credentialSubject: {
    id: string;
    type: "StatusList2021";
    statusPurpose: "revocation";
    encodedList: string;
  };
  proof?: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    jws: string;
  };
}

export async function buildStatusListVC(
  listId: string,
  encodedList: string,
  privateKey: CryptoKey,
): Promise<StatusListVCDocument> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://pedagogue.app";
  const statusUrl = `${appUrl}/api/credential/status/${listId}`;
  const now = new Date().toISOString();

  const doc: StatusListVCDocument = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://w3id.org/vc/status-list/2021/v1",
    ],
    id: statusUrl,
    type: ["VerifiableCredential", "StatusList2021Credential"],
    issuer: { id: `${appUrl}/issuer`, name: "Pedagogue" },
    validFrom: now,
    credentialSubject: {
      id: statusUrl,
      type: "StatusList2021",
      statusPurpose: "revocation",
      encodedList,
    },
  };

  const jws = await new SignJWT({
    vc: doc,
    statusListId: listId,
  } as Record<string, unknown>)
    .setProtectedHeader({ alg: "EdDSA", kid: KEY_ID })
    .setIssuer(`${appUrl}/issuer`)
    .setSubject(statusUrl)
    .setIssuedAt()
    .sign(privateKey as unknown as KeyLike);

  return {
    ...doc,
    proof: {
      type: "JsonWebSignature2020",
      created: now,
      verificationMethod: `${appUrl}/issuer#${KEY_ID}`,
      proofPurpose: "assertionMethod",
      jws,
    },
  };
}

export async function getStatusListVC(
  listId: string,
  supabase: AnyDB,
): Promise<StatusListVCDocument | null> {
  const { data } = await supabase
    .from("status_lists")
    .select("signed_vc_json")
    .eq("id", listId)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return (data?.signed_vc_json as StatusListVCDocument) ?? null;
}
