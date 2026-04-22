import { describe, it, expect, beforeAll } from "vitest";
import {
  gzip,
  gunzip,
  encodeList,
  decodeList,
  getBit,
  setBit,
  getOrCreateEncodedList,
  isRevoked,
  revokeCredential,
  buildStatusListVC,
  STATUS_LIST_BYTES,
  DEFAULT_LIST_ID,
} from "../revocation.js";
import { generateKeypair } from "../keys.js";

// ---------------------------------------------------------------------------
// Fake in-memory Supabase client
// ---------------------------------------------------------------------------

interface FakeRow {
  id: string;
  encoded_list: string;
  signed_vc_json: unknown;
  [key: string]: unknown;
}

function makeFakeSupabase(initial?: FakeRow) {
  let stored: FakeRow | null = initial ?? null;

  const chain = (resolve: () => unknown) => ({
    select: (_cols?: string) => ({
      eq: (_col: string, _val: unknown) => ({
        single: async () => ({
          data: stored,
          error: stored ? null : { code: "PGRST116", message: "not found" },
        }),
        maybeSingle: async () => ({ data: stored, error: null }),
      }),
    }),
    insert: async (data: FakeRow) => {
      stored = { ...data };
      return { data: stored, error: null };
    },
    update: (data: Partial<FakeRow>) => ({
      eq: async (_col: string, _val: unknown) => {
        if (stored) stored = { ...stored, ...data };
        return { error: null };
      },
    }),
  });

  return {
    getStored: () => stored,
    setStored: (v: FakeRow | null) => {
      stored = v;
    },
    from: (_table: string) => chain(() => stored),
  };
}

// ---------------------------------------------------------------------------
// Compression
// ---------------------------------------------------------------------------

describe("gzip / gunzip", () => {
  it("roundtrip of empty bitstring", async () => {
    const bits = new Uint8Array(STATUS_LIST_BYTES);
    const compressed = await gzip(bits);
    const decompressed = await gunzip(compressed);
    expect(decompressed).toEqual(bits);
  });

  it("compressed empty list is much smaller than raw", async () => {
    const bits = new Uint8Array(STATUS_LIST_BYTES);
    const compressed = await gzip(bits);
    // 16 KB of zeros should compress to < 200 bytes
    expect(compressed.length).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------------------
// Encode / decode
// ---------------------------------------------------------------------------

describe("encodeList / decodeList", () => {
  it("roundtrip preserves bits", async () => {
    const bits = new Uint8Array(STATUS_LIST_BYTES) as Uint8Array;
    bits[0] = 0b10110011;
    bits[100] = 0xff;
    const encoded = await encodeList(bits);
    expect(typeof encoded).toBe("string");
    const decoded = await decodeList(encoded);
    expect(decoded[0]).toBe(0b10110011);
    expect(decoded[100]).toBe(0xff);
    expect(decoded.length).toBe(STATUS_LIST_BYTES);
  });
});

// ---------------------------------------------------------------------------
// Bit operations
// ---------------------------------------------------------------------------

describe("getBit / setBit", () => {
  it("fresh bitstring has all bits cleared", () => {
    const bits = new Uint8Array(STATUS_LIST_BYTES);
    expect(getBit(bits, 0)).toBe(false);
    expect(getBit(bits, 7)).toBe(false);
    expect(getBit(bits, 131_071)).toBe(false);
  });

  it("setBit / getBit roundtrip for index 0", () => {
    const bits = new Uint8Array(STATUS_LIST_BYTES);
    const updated = setBit(bits, 0);
    expect(getBit(updated, 0)).toBe(true);
    expect(getBit(updated, 1)).toBe(false);
  });

  it("setBit does not mutate the original", () => {
    const bits = new Uint8Array(STATUS_LIST_BYTES);
    setBit(bits, 5);
    expect(getBit(bits, 5)).toBe(false); // original unchanged
  });

  it("setBit for various indices", () => {
    const bits = new Uint8Array(STATUS_LIST_BYTES);
    const indices = [0, 1, 7, 8, 15, 42, 1023, 131_071];
    let current: Uint8Array = bits;
    for (const idx of indices) {
      current = setBit(current, idx);
      expect(getBit(current, idx)).toBe(true);
    }
    // All others should still be 0
    expect(getBit(current, 2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DB-backed isRevoked / revokeCredential
// ---------------------------------------------------------------------------

describe("isRevoked", () => {
  it("returns false for fresh list (no existing row)", async () => {
    const db = makeFakeSupabase(); // nothing stored
    const result = await isRevoked(42, db as never);
    expect(result).toBe(false);
    // Should have auto-created the list
    expect(db.getStored()).not.toBeNull();
  });

  it("returns false for unrevoked index on existing list", async () => {
    const bits = new Uint8Array(STATUS_LIST_BYTES);
    const encoded = await encodeList(bits);
    const db = makeFakeSupabase({
      id: DEFAULT_LIST_ID,
      encoded_list: encoded,
      signed_vc_json: null,
    });
    expect(await isRevoked(10, db as never)).toBe(false);
  });

  it("returns true after bit is set", async () => {
    const bits = setBit(new Uint8Array(STATUS_LIST_BYTES), 10);
    const encoded = await encodeList(bits);
    const db = makeFakeSupabase({
      id: DEFAULT_LIST_ID,
      encoded_list: encoded,
      signed_vc_json: null,
    });
    expect(await isRevoked(10, db as never)).toBe(true);
    expect(await isRevoked(11, db as never)).toBe(false);
  });
});

describe("revokeCredential", () => {
  let privateKey: CryptoKey;
  let publicKey: CryptoKey;

  beforeAll(async () => {
    const keys = await generateKeypair();
    privateKey = keys.privateKey;
    publicKey = keys.publicKey;
  });

  it("flips the correct bit and stores a signed VC", async () => {
    const bits = new Uint8Array(STATUS_LIST_BYTES);
    const encoded = await encodeList(bits);
    const db = makeFakeSupabase({
      id: DEFAULT_LIST_ID,
      encoded_list: encoded,
      signed_vc_json: null,
    });

    expect(await isRevoked(7, db as never)).toBe(false);

    await revokeCredential(7, db as never, privateKey);

    // Bit should now be set
    expect(await isRevoked(7, db as never)).toBe(true);
    // Neighbouring bit unaffected
    expect(await isRevoked(6, db as never)).toBe(false);
    expect(await isRevoked(8, db as never)).toBe(false);

    // signed_vc_json should be populated
    const stored = db.getStored();
    expect(stored?.signed_vc_json).not.toBeNull();
  });

  it("revoking the same credential twice is idempotent", async () => {
    const bits = new Uint8Array(STATUS_LIST_BYTES);
    const encoded = await encodeList(bits);
    const db = makeFakeSupabase({
      id: DEFAULT_LIST_ID,
      encoded_list: encoded,
      signed_vc_json: null,
    });

    await revokeCredential(3, db as never, privateKey);
    await revokeCredential(3, db as never, privateKey);

    expect(await isRevoked(3, db as never)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// StatusList VC
// ---------------------------------------------------------------------------

describe("buildStatusListVC", () => {
  let privateKey: CryptoKey;

  beforeAll(async () => {
    ({ privateKey } = await generateKeypair());
  });

  it("produces a valid StatusList2021Credential document", async () => {
    const bits = new Uint8Array(STATUS_LIST_BYTES);
    const encoded = await encodeList(bits);
    const vc = await buildStatusListVC(DEFAULT_LIST_ID, encoded, privateKey);

    expect(vc["@context"]).toContain("https://www.w3.org/ns/credentials/v2");
    expect(vc.type).toContain("StatusList2021Credential");
    expect(vc.credentialSubject.type).toBe("StatusList2021");
    expect(vc.credentialSubject.statusPurpose).toBe("revocation");
    expect(vc.credentialSubject.encodedList).toBe(encoded);
    expect(vc.proof?.jws).toBeTruthy();
    // Compact JWT: 3 parts
    expect(vc.proof?.jws.split(".")).toHaveLength(3);
  });
});
