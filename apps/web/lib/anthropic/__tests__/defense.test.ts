import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks — defined before vi.mock() so vitest hoisting can see them
// ---------------------------------------------------------------------------

// These are captured by the mock factory and accessible from tests
const mockStream = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { stream: mockStream },
  })),
}));

import { runDefenseTurn, type InterviewContext } from "../defense";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<InterviewContext> = {}): InterviewContext {
  return {
    phase: "blueprint_interrogation",
    turns: [],
    blueprintSummary: "Habit tracker with streaks, Python, 5 features.",
    snapshotOddities: "get_streak was rewritten 3 times.",
    lowestMasteryConceptId: "concept_range_vs_len",
    questionCount: 0,
    counterfactualScores: [],
    ...overrides,
  };
}

function makeAsyncIterable(events: unknown[]) {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next: async () => {
          if (i < events.length) return { value: events[i++], done: false };
          return { value: undefined, done: true };
        },
      };
    },
    finalMessage: async () => ({
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 80 },
    }),
  };
}

function makeTextDeltaEvents(text: string) {
  return [
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    { type: "message_stop" },
  ];
}

function makeToolUseEvents(name: string, input: unknown) {
  const inputJson = JSON.stringify(input);
  const mid = Math.floor(inputJson.length / 2);
  return [
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu_test_001", name } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: inputJson.slice(0, mid) } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: inputJson.slice(mid) } },
    { type: "content_block_stop", index: 0 },
    { type: "message_stop" },
  ];
}

async function collectEvents(gen: AsyncGenerator<unknown>) {
  const events = [];
  for await (const e of gen) events.push(e);
  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runDefenseTurn", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-anth-key";
    // Default: empty stream — tests override as needed
    mockStream.mockReturnValue(makeAsyncIterable([]));
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Text streaming
  // ---------------------------------------------------------------------------

  it("yields text_delta events from Claude text output", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(
      makeTextDeltaEvents("Walk me through your get_streak function.")
    ));

    const events = await collectEvents(runDefenseTurn({
      sessionId: "sess-001",
      context: makeContext(),
      userText: "I built a habit tracker.",
    }));

    const textDeltas = events.filter((e: any) => e.kind === "text_delta");
    expect(textDeltas).toHaveLength(1);
    expect((textDeltas[0] as any).text).toBe("Walk me through your get_streak function.");
  });

  it("yields a done event at the end of the stream", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(makeTextDeltaEvents("Hello.")));

    const events = await collectEvents(runDefenseTurn({
      sessionId: "sess-002",
      context: makeContext(),
      userText: "Ready.",
    }));

    const done = events.find((e: any) => e.kind === "done");
    expect(done).toBeDefined();
    expect((done as any).finishReason).toBe("end_turn");
  });

  it("passes prior turns as message history", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(makeTextDeltaEvents("Good follow-up.")));

    const ctx = makeContext({
      turns: [
        { role: "user", text: "I wrote get_streak." },
        { role: "assistant", text: "What does it return?" },
      ],
    });

    await collectEvents(runDefenseTurn({
      sessionId: "sess-003",
      context: ctx,
      userText: "It returns the current streak count.",
    }));

    const callArgs = mockStream.mock.calls[0][0];
    // 2 prior turns + 1 new user turn = 3
    expect(callArgs.messages).toHaveLength(3);
    expect(callArgs.messages[2].role).toBe("user");
  });

  it("wraps user text in <user_input> tags", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(makeTextDeltaEvents("Understood.")));

    await collectEvents(runDefenseTurn({
      sessionId: "sess-004",
      context: makeContext(),
      userText: "I used range(len(x)).",
    }));

    const callArgs = mockStream.mock.calls[0][0];
    const lastMsg = callArgs.messages[callArgs.messages.length - 1];
    expect(lastMsg.content).toContain("<user_input>");
    expect(lastMsg.content).toContain("</user_input>");
    expect(lastMsg.content).toContain("range(len(x))");
  });

  it("uses claude-sonnet-4-6 model", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(makeTextDeltaEvents("OK.")));

    await collectEvents(runDefenseTurn({
      sessionId: "sess-005",
      context: makeContext(),
      userText: "Hello.",
    }));

    expect(mockStream.mock.calls[0][0].model).toBe("claude-sonnet-4-6");
  });

  it("uses temperature 0.3", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(makeTextDeltaEvents("Yes.")));

    await collectEvents(runDefenseTurn({
      sessionId: "sess-006",
      context: makeContext(),
      userText: "Hi.",
    }));

    expect(mockStream.mock.calls[0][0].temperature).toBe(0.3);
  });

  it("includes the fine-grained tool streaming beta header", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(makeTextDeltaEvents("Good.")));

    await collectEvents(runDefenseTurn({
      sessionId: "sess-007",
      context: makeContext(),
      userText: "Done.",
    }));

    expect(mockStream.mock.calls[0][0].betas).toContain("fine-grained-tool-streaming-2025-05-14");
  });

  it("includes all 3 defense tools in every call", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(makeTextDeltaEvents("Proceed.")));

    await collectEvents(runDefenseTurn({
      sessionId: "sess-008",
      context: makeContext(),
      userText: "Ready.",
    }));

    const toolNames = mockStream.mock.calls[0][0].tools.map((t: any) => t.name);
    expect(toolNames).toContain("inject_bug");
    expect(toolNames).toContain("score_counterfactual");
    expect(toolNames).toContain("end_phase");
  });

  it("includes blueprint summary in system prompt", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(makeTextDeltaEvents("Interesting.")));

    const ctx = makeContext({
      blueprintSummary: "A to-do list app with priorities.",
      snapshotOddities: "main.py rewritten 5 times in 30 minutes.",
    });

    await collectEvents(runDefenseTurn({
      sessionId: "sess-009",
      context: ctx,
      userText: "Yes.",
    }));

    const system = mockStream.mock.calls[0][0].system;
    expect(system).toContain("to-do list app");
    expect(system).toContain("rewritten 5 times");
  });

  it("includes Phase 2 guidance in system prompt for bug_injection phase", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(makeTextDeltaEvents("Let me inject a bug.")));

    await collectEvents(runDefenseTurn({
      sessionId: "sess-010",
      context: makeContext({ phase: "bug_injection" }),
      userText: "Ready.",
    }));

    const system = mockStream.mock.calls[0][0].system;
    expect(system).toContain("Phase 2: Bug Injection");
    expect(system).toContain("inject_bug");
  });

  it("includes Phase 3 guidance in system prompt for counterfactual phase", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(makeTextDeltaEvents("What if 100x?")));

    await collectEvents(runDefenseTurn({
      sessionId: "sess-011",
      context: makeContext({ phase: "counterfactual" }),
      userText: "Ready.",
    }));

    const system = mockStream.mock.calls[0][0].system;
    expect(system).toContain("Phase 3: Counterfactuals");
    expect(system).toContain("score_counterfactual");
  });

  // ---------------------------------------------------------------------------
  // Tool use
  // ---------------------------------------------------------------------------

  it("yields tool_input_delta events as inject_bug JSON streams in", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(
      makeToolUseEvents("inject_bug", {
        conceptId: "concept_range_vs_len",
        rationale: "Lowest mastery concept.",
      })
    ));

    const events = await collectEvents(runDefenseTurn({
      sessionId: "sess-012",
      context: makeContext({ phase: "bug_injection" }),
      userText: "I fixed the bug.",
    }));

    const deltas = events.filter((e: any) => e.kind === "tool_input_delta");
    expect(deltas.length).toBeGreaterThan(0);
    expect((deltas[0] as any).toolIndex).toBe(0);
  });

  it("yields tool_result after inject_bug completes", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(
      makeToolUseEvents("inject_bug", {
        conceptId: "concept_range_vs_len",
        rationale: "Lowest mastery concept.",
      })
    ));

    const events = await collectEvents(runDefenseTurn({
      sessionId: "sess-013",
      context: makeContext({ phase: "bug_injection" }),
      userText: "OK.",
    }));

    const toolResults = events.filter((e: any) => e.kind === "tool_result");
    expect(toolResults).toHaveLength(1);
    expect((toolResults[0] as any).toolName).toBe("inject_bug");
    expect((toolResults[0] as any).result.ok).toBe(true);
  });

  it("yields tool_result after score_counterfactual completes", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(
      makeToolUseEvents("score_counterfactual", {
        questionId: "q-001",
        questionText: "What if the dataset were 100× larger?",
        rubric: { correctness: 0.8, reasoningDepth: 0.7, tradeoffAwareness: 0.6 },
        summary: "Student identified the right bottleneck.",
      })
    ));

    const events = await collectEvents(runDefenseTurn({
      sessionId: "sess-014",
      context: makeContext({ phase: "counterfactual" }),
      userText: "I would use a database index.",
    }));

    const toolResults = events.filter((e: any) => e.kind === "tool_result");
    expect(toolResults).toHaveLength(1);
    expect((toolResults[0] as any).toolName).toBe("score_counterfactual");
    expect((toolResults[0] as any).result.data.questionId).toBe("q-001");
  });

  it("end_phase returns the next phase in result data", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(
      makeToolUseEvents("end_phase", {
        currentPhase: "blueprint_interrogation",
        reason: "Asked 4 questions, phase objectives met.",
      })
    ));

    const events = await collectEvents(runDefenseTurn({
      sessionId: "sess-015",
      context: makeContext({ phase: "blueprint_interrogation" }),
      userText: "I finished explaining.",
    }));

    const toolResults = events.filter((e: any) => e.kind === "tool_result");
    expect(toolResults).toHaveLength(1);
    expect((toolResults[0] as any).toolName).toBe("end_phase");
    expect((toolResults[0] as any).result.data.nextPhase).toBe("bug_injection");
  });

  it("end_phase bug_injection → counterfactual phase transition", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(
      makeToolUseEvents("end_phase", {
        currentPhase: "bug_injection",
        reason: "Bug fixed successfully.",
      })
    ));

    const events = await collectEvents(runDefenseTurn({
      sessionId: "sess-016",
      context: makeContext({ phase: "bug_injection" }),
      userText: "Fixed.",
    }));

    const tr = events.filter((e: any) => e.kind === "tool_result");
    expect(tr[0].result.data.nextPhase).toBe("counterfactual");
  });

  it("end_phase counterfactual → complete", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(
      makeToolUseEvents("end_phase", {
        currentPhase: "counterfactual",
        reason: "All counterfactuals scored.",
      })
    ));

    const events = await collectEvents(runDefenseTurn({
      sessionId: "sess-017",
      context: makeContext({ phase: "counterfactual" }),
      userText: "Done.",
    }));

    const tr = events.filter((e: any) => e.kind === "tool_result");
    expect(tr[0].result.data.nextPhase).toBe("complete");
  });

  it("tool_result comes AFTER tool_input_deltas (streaming order)", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(
      makeToolUseEvents("inject_bug", {
        conceptId: "concept_async_basics",
        rationale: "Test async understanding.",
      })
    ));

    const events = await collectEvents(runDefenseTurn({
      sessionId: "sess-018",
      context: makeContext({ phase: "bug_injection" }),
      userText: "Ready.",
    }));

    const firstDeltaIdx = events.findIndex((e: any) => e.kind === "tool_input_delta");
    const toolResultIdx = events.findIndex((e: any) => e.kind === "tool_result");
    expect(firstDeltaIdx).toBeGreaterThanOrEqual(0);
    expect(toolResultIdx).toBeGreaterThan(firstDeltaIdx);
  });

  it("handles unknown tool names gracefully (returns error result)", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(
      makeToolUseEvents("unknown_tool", { foo: "bar" })
    ));

    const events = await collectEvents(runDefenseTurn({
      sessionId: "sess-019",
      context: makeContext(),
      userText: "Hmm.",
    }));

    const toolResults = events.filter((e: any) => e.kind === "tool_result");
    expect(toolResults[0].result.ok).toBe(false);
    expect(toolResults[0].result.error).toContain("Unknown tool");
  });

  it("wraps prior assistant turns WITHOUT user_input tags", async () => {
    mockStream.mockReturnValue(makeAsyncIterable(makeTextDeltaEvents("Good.")));

    const ctx = makeContext({
      turns: [
        { role: "assistant", text: "What does get_streak return?" },
      ],
    });

    await collectEvents(runDefenseTurn({
      sessionId: "sess-020",
      context: ctx,
      userText: "It returns an int.",
    }));

    const msgs = mockStream.mock.calls[0][0].messages;
    const assistantMsg = msgs[0];
    expect(assistantMsg.role).toBe("assistant");
    // Assistant messages should NOT be wrapped in user_input tags
    expect(assistantMsg.content).not.toContain("<user_input>");
    expect(assistantMsg.content).toBe("What does get_streak return?");
  });
});
