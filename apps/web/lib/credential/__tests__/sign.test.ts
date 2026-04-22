import { describe, it, expect, beforeAll } from "vitest";
import { generateKeypair, exportJWK, importPrivateKey, KEY_ID } from "../keys.js";
import { buildVC } from "../builder.js";
import { signVC, verifyVC } from "../sign.js";
import type { VerifiableCredentialSubject } from "@pedagogue/shared";

const DEMO_SUBJECT: VerifiableCredentialSubject = {
  projectTitle: "Habit Tracker with Streaks",
  conceptsDemonstrated: [
    { id: "concept_loops", name: "Loops", masteryScore: 0.91 },
    { id: "concept_async", name: "Async/Await", masteryScore: 0.82 },
  ],
  competencyRadar: {
    problemDecomposition: 0.82,
    controlFlow: 0.91,
    debuggingRigor: 0.68,
  },
  proofOfStruggle: [
    {
      errorSignature: "TypeError: 'int' object is not iterable",
      fixDiff: "@@ -14,1 +14,1 @@\n-for i in len(x):\n+for i in range(len(x)):",
      defenseAnswerId: "answer_3",
    },
  ],
  interviewSummary: {
    phases: [
      { phase: "blueprint_interrogation", questions: 4 },
      { phase: "bug_injection", questions: 2 },
    ],
    overallRubric: {
      correctness: 0.79,
      reasoningDepth: 0.71,
      tradeoffAwareness: 0.68,
    },
  },
};

describe("credential: key management", () => {
  it("generates extractable Ed25519 keypair", async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const pubJwk = await exportJWK(publicKey);

    expect(pubJwk.kty).toBe("OKP");
    expect(pubJwk.crv).toBe("Ed25519");
    expect(typeof pubJwk.x).toBe("string");
    // Public key must NOT contain the private scalar
    expect(pubJwk.d).toBeUndefined();

    const privJwk = await exportJWK(privateKey);
    expect(privJwk.kty).toBe("OKP");
    expect(typeof privJwk.d).toBe("string");
  });

  it("importPrivateKey → sign → verify roundtrip", async () => {
    const { privateKey: orig, publicKey } = await generateKeypair();
    const privJwk = await exportJWK(orig);
    const reimported = await importPrivateKey(privJwk);

    const vc = buildVC(DEMO_SUBJECT, "session-import-001");
    const jws = await signVC(vc, reimported);
    const recovered = await verifyVC(jws, publicKey);

    expect(recovered.credentialSubject.projectTitle).toBe(DEMO_SUBJECT.projectTitle);
  });
});

describe("credential: buildVC", () => {
  it("produces a W3C VC v2.0 document structure", () => {
    const doc = buildVC(DEMO_SUBJECT, "session-build-001");

    expect(doc["@context"]).toContain("https://www.w3.org/ns/credentials/v2");
    expect(doc.type).toContain("VerifiableCredential");
    expect(doc.type).toContain("PedagogueCompletionCredential");
    expect(doc.issuer.name).toBe("Pedagogue");
    expect(doc.credentialSubject.id).toBe("urn:session:session-build-001");
    expect(doc.credentialSubject.projectTitle).toBe(DEMO_SUBJECT.projectTitle);
    expect(doc.validFrom).toBeTruthy();
    expect(doc.proof).toBeUndefined(); // proof added separately by signVC
  });
});

describe("credential: sign + verify", () => {
  let privateKey: CryptoKey;
  let publicKey: CryptoKey;

  beforeAll(async () => {
    const keys = await generateKeypair();
    privateKey = keys.privateKey;
    publicKey = keys.publicKey;
  });

  it("compact JWS has 3 base64url-separated parts", async () => {
    const vc = buildVC(DEMO_SUBJECT, "session-sign-001");
    const jws = await signVC(vc, privateKey);

    expect(typeof jws).toBe("string");
    const parts = jws.split(".");
    expect(parts).toHaveLength(3);
    // Header should decode to {"alg":"EdDSA","kid":"..."}
    const header = JSON.parse(Buffer.from(parts[0]!, "base64url").toString());
    expect(header.alg).toBe("EdDSA");
    expect(header.kid).toBe(KEY_ID);
  });

  it("roundtrip: sign → verify preserves full subject", async () => {
    const vc = buildVC(DEMO_SUBJECT, "session-sign-002");
    const jws = await signVC(vc, privateKey);
    const recovered = await verifyVC(jws, publicKey);

    expect(recovered.credentialSubject.projectTitle).toBe(DEMO_SUBJECT.projectTitle);
    expect(recovered.credentialSubject.conceptsDemonstrated).toHaveLength(2);
    expect(recovered.credentialSubject.proofOfStruggle[0]?.errorSignature).toBe(
      DEMO_SUBJECT.proofOfStruggle[0]?.errorSignature,
    );
    expect(recovered.issuer.name).toBe("Pedagogue");
  });

  it("detects a tampered payload", async () => {
    const vc = buildVC(DEMO_SUBJECT, "session-sign-003");
    const jws = await signVC(vc, privateKey);

    const [head, payload, sig] = jws.split(".");
    // Flip the last 4 chars of the payload to corrupt it
    const bad = payload!.slice(0, -4) + "ZZZZ";
    const tampered = [head, bad, sig].join(".");

    await expect(verifyVC(tampered, publicKey)).rejects.toThrow();
  });

  it("detects a tampered signature", async () => {
    const vc = buildVC(DEMO_SUBJECT, "session-sign-004");
    const jws = await signVC(vc, privateKey);

    const [head, payload, sig] = jws.split(".");
    const badSig = sig!.slice(0, -4) + "ZZZZ";
    const tampered = [head, payload, badSig].join(".");

    await expect(verifyVC(tampered, publicKey)).rejects.toThrow();
  });

  it("rejects a JWS signed by a different key", async () => {
    const { privateKey: otherKey } = await generateKeypair();
    const vc = buildVC(DEMO_SUBJECT, "session-sign-005");
    const jws = await signVC(vc, otherKey);

    await expect(verifyVC(jws, publicKey)).rejects.toThrow();
  });
});
