import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock client.ts call() before importing the module under test.
// vi.hoisted() ensures mockCall is defined before vi.mock() factory runs.
// ---------------------------------------------------------------------------
const mockCall = vi.hoisted(() => vi.fn());
vi.mock("../client", () => ({
  call: mockCall,
}));

import { generateSessionMemory } from "../memory";

// ---------------------------------------------------------------------------
// Fake Supabase builder
// ---------------------------------------------------------------------------

function makeChain(returnData: unknown, returnError: unknown = null) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "order", "limit", "maybeSingle", "single", "upsert"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Terminal calls
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: returnData,
    error: returnError,
  });
  (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: null,
    error: null,
  });
  return chain;
}

function makeFakeSupabase(opts: {
  session?: unknown;
  concepts?: unknown[];
  upsertId?: string;
}) {
  const { session = { project_blueprint_json: {}, started_at: null, ended_at: null }, concepts = [], upsertId = "mem-uuid-1" } = opts;

  // Track call order to route .from() correctly
  let fromCallIndex = 0;

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      fromCallIndex++;
      const chain: Record<string, unknown> = {};
      const fluent = vi.fn().mockReturnValue(chain);

      // All fluent methods return chain
      const methods = ["select", "eq", "order", "limit", "upsert"];
      for (const m of methods) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }

      chain.single = vi.fn().mockImplementation(() => {
        if (table === "sessions") {
          return Promise.resolve({ data: session, error: null });
        }
        if (table === "user_memories") {
          return Promise.resolve({ data: { id: upsertId }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

      // concept_nodes returns array
      if (table === "concept_nodes") {
        (chain.limit as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: concepts,
          error: null,
        });
      } else if (table === "interventions") {
        (chain.limit as ReturnType<typeof vi.fn>).mockResolvedValue({
          data: [],
          error: null,
        });
      } else if (table === "defense_sessions") {
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        (chain.limit as ReturnType<typeof vi.fn>).mockReturnValue({ ...chain });
      }

      return chain;
    }),
  };

  return supabase;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateSessionMemory", () => {
  const SESSION_ID = "00000000-0000-0000-0000-000000000001";
  const USER_ID = "user-abc-123";

  beforeEach(() => {
    mockCall.mockReset();
    mockCall.mockResolvedValue({
      parsed: "The student practiced loops and recursion this session. They struggled with base cases but mastered array traversal. No defense completed.",
      usage: { input_tokens: 200, output_tokens: 40, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      raw: {},
    });
  });

  it("calls Haiku and returns memoryId + wordCount", async () => {
    const supabase = makeFakeSupabase({ upsertId: "mem-uuid-1" });
    const result = await generateSessionMemory(SESSION_ID, USER_ID, supabase as never);

    expect(result.memoryId).toBe("mem-uuid-1");
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it("calls call() with model haiku and no cache_control", async () => {
    const supabase = makeFakeSupabase({});
    await generateSessionMemory(SESSION_ID, USER_ID, supabase as never);

    expect(mockCall).toHaveBeenCalledOnce();
    const callOpts = mockCall.mock.calls[0]![0];
    expect(callOpts.model).toBe("haiku");
    // No cache_control on system blocks
    for (const block of callOpts.system) {
      expect(block).not.toHaveProperty("cache_control");
    }
  });

  it("includes concept data in user prompt when concepts present", async () => {
    const supabase = makeFakeSupabase({
      concepts: [
        { id: "c1", name: "Loops", mastery_score: 0.4, total_attempts: 5 },
        { id: "c2", name: "Recursion", mastery_score: 0.7, total_attempts: 3 },
      ],
    });
    await generateSessionMemory(SESSION_ID, USER_ID, supabase as never);

    const prompt = mockCall.mock.calls[0]![0].messages[0].content as string;
    expect(prompt).toContain("Loops");
    expect(prompt).toContain("Recursion");
  });

  it("idempotency — second call upserts (does not insert duplicate)", async () => {
    const supabase = makeFakeSupabase({ upsertId: "mem-uuid-existing" });
    const first = await generateSessionMemory(SESSION_ID, USER_ID, supabase as never);
    const second = await generateSessionMemory(SESSION_ID, USER_ID, supabase as never);

    // Both resolve to the same memoryId returned by upsert
    expect(first.memoryId).toBe("mem-uuid-existing");
    expect(second.memoryId).toBe("mem-uuid-existing");

    // user_memories was touched with onConflict: "session_id" both times
    const memoryCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.filter(
      (args: unknown[]) => args[0] === "user_memories",
    );
    expect(memoryCalls.length).toBe(2);
  });

  it("throws if upsert fails", async () => {
    const supabase = makeFakeSupabase({});

    // Override user_memories single to return error
    const originalFrom = supabase.from;
    supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === "user_memories") {
        const chain: Record<string, unknown> = {};
        chain.upsert = vi.fn().mockReturnValue(chain);
        chain.select = vi.fn().mockReturnValue(chain);
        chain.single = vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } });
        return chain;
      }
      return originalFrom(table);
    });

    await expect(generateSessionMemory(SESSION_ID, USER_ID, supabase as never)).rejects.toThrow("DB error");
  });
});
