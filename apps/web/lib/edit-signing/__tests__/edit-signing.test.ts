import { describe, it, expect } from "vitest";
import { signEdit, verifyEdit } from "../index.js";
import { generateKeypair } from "@/lib/credential/keys.js";

describe("edit-signing roundtrip", () => {
  it("sign + verify roundtrip returns original payload", async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const edit = {
      sessionId: "00000000-0000-0000-0000-000000000001",
      filePath: "main.py",
      originalLine: "for i in range(len(lst)):",
      patchedLine:  "for i in range(len(lst)):\n    # bug injected",
    };

    const jwt = await signEdit(edit, privateKey);
    expect(typeof jwt).toBe("string");
    expect(jwt.split(".")).toHaveLength(3); // compact JWS

    const decoded = await verifyEdit(jwt, publicKey);
    expect(decoded.filePath).toBe(edit.filePath);
    expect(decoded.originalLine).toBe(edit.originalLine);
    expect(decoded.patchedLine).toBe(edit.patchedLine);
    expect(decoded.sessionId).toBe(edit.sessionId);
    expect(decoded.issuedAt).toBeGreaterThan(0);
  });

  it("verifyEdit throws on tampered token", async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const jwt = await signEdit(
      { sessionId: "s1", filePath: "a.py", originalLine: "x", patchedLine: "y" },
      privateKey,
    );

    // Flip one char in the signature (last segment)
    const parts = jwt.split(".");
    parts[2] = parts[2]!.slice(0, -2) + "AA";
    const tampered = parts.join(".");

    await expect(verifyEdit(tampered, publicKey)).rejects.toThrow();
  });
});
