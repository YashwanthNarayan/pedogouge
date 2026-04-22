import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { submitBatch, getResults, waitForCompletion, TimeoutError } from "../client.js";

// Minimal Judge0 result factory
function makeResult(token: string, statusId: number, stdout = "hello\n") {
  return {
    token,
    status: { id: statusId, description: "Accepted" },
    // Judge0 returns base64-encoded output
    stdout: Buffer.from(stdout).toString("base64"),
    stderr: null,
    compile_output: null,
    time: "0.05",
    memory: 4096,
    exit_code: 0,
  };
}

describe("Judge0 client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("submitBatch", () => {
    it("POSTs to /submissions/batch and returns tokens", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ token: "abc123" }],
      });

      const tokens = await submitBatch([{ language_id: 89, additional_files: "AAAA" }]);
      expect(tokens).toEqual([{ token: "abc123" }]);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/submissions/batch");
      expect(url).toContain("base64_encoded=true");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toMatchObject({
        submissions: [{ language_id: 89 }],
      });
    });

    it("throws on non-ok response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => "Unprocessable",
      });

      await expect(submitBatch([{ language_id: 71 }])).rejects.toThrow("422");
    });
  });

  describe("getResults", () => {
    it("GETs batch results and decodes base64 fields", async () => {
      const raw = makeResult("tok1", 3, "world\n");
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ submissions: [raw] }),
      });

      const results = await getResults(["tok1"]);
      expect(results).toHaveLength(1);
      expect(results[0]!.stdout).toBe("world\n");   // decoded
      expect(results[0]!.status.id).toBe(3);
    });

    it("handles null stdout/stderr without throwing", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          submissions: [
            { token: "t", status: { id: 5, description: "TLE" }, stdout: null, stderr: null, compile_output: null, time: null, memory: null, exit_code: null },
          ],
        }),
      });

      const [result] = await getResults(["t"]);
      expect(result!.stdout).toBeNull();
    });
  });

  describe("waitForCompletion", () => {
    it("returns when all tokens reach terminal status", async () => {
      // First poll: pending (status 1); second poll: accepted (status 3)
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ submissions: [makeResult("t1", 1)] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ submissions: [makeResult("t1", 3)] }),
        });

      const results = await waitForCompletion(["t1"], 0, 5_000);
      expect(results[0]!.status.id).toBe(3);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("throws TimeoutError when deadline exceeded", async () => {
      // Always return pending status
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ submissions: [makeResult("t1", 2)] }),
      });

      await expect(
        waitForCompletion(["t1"], 0, 50), // 50ms deadline — will expire quickly
      ).rejects.toBeInstanceOf(TimeoutError);
    });

    it("resolves immediately if already terminal on first poll", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ submissions: [makeResult("t1", 4)] }),
      });

      const results = await waitForCompletion(["t1"], 1000, 5_000);
      expect(results[0]!.status.id).toBe(4);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
