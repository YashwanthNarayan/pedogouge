import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  selectIntervention,
  generateTierContent,
  type InterventionDecision,
} from "../intervention";

// ---------------------------------------------------------------------------
// Mock the Anthropic client
// ---------------------------------------------------------------------------

vi.mock("../client", () => ({
  call: vi.fn(),
  callWithCitations: vi.fn(),
}));

import { call } from "../client";
const mockCall = vi.mocked(call);

// ---------------------------------------------------------------------------
// Mock the canary helper
// ---------------------------------------------------------------------------

vi.mock("../canary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../canary")>();
  return {
    ...actual,
    generateCanary: () => "TEST-CANARY-1234",
    injectCanary: (blocks: unknown[]) => blocks,
  };
});

// ---------------------------------------------------------------------------
// Mock the curriculum generator (Tier 3 delegate)
// ---------------------------------------------------------------------------

vi.mock("../curriculum", () => ({
  generateLesson: vi.fn().mockResolvedValue({
    bodyMd: "# Lesson\n\nContent here.",
    citations: [],
    metadata: { difficulty: "beginner", prerequisiteConceptIds: [], runnableCells: [], estimatedMinutes: 10 },
  }),
}));

// ---------------------------------------------------------------------------
// Fixture: valid InterventionDecision from the meta-agent
// ---------------------------------------------------------------------------

function makeDecision(overrides: Partial<InterventionDecision> = {}): InterventionDecision {
  return {
    tier: 1,
    conceptId: "concept_range_vs_len",
    rationale: "First failure — Socratic nudge appropriate",
    expectedDurationSeconds: 30,
    fallbackTierIfStillStuck: 2,
    deliveryChannel: "chat",
    ...overrides,
  };
}

function makeCallResponse(decision: InterventionDecision) {
  return {
    parsed: decision,
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 80 },
    raw: {} as never,
  };
}

// ---------------------------------------------------------------------------
// selectIntervention tests
// ---------------------------------------------------------------------------

describe("selectIntervention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls Sonnet (not Opus or Haiku) as the meta-agent", async () => {
    const decision = makeDecision({ tier: 1 });
    mockCall.mockResolvedValue(makeCallResponse(decision));

    await selectIntervention({
      sessionId: "00000000-0000-0000-0000-000000000001",
      conceptId: "concept_range_vs_len",
      strugglePattern: "none",
    });

    expect(mockCall).toHaveBeenCalledOnce();
    const arg = mockCall.mock.calls[0][0];
    expect(arg.model).toBe("sonnet");
  });

  it("uses output_schema (structured output)", async () => {
    mockCall.mockResolvedValue(makeCallResponse(makeDecision()));

    await selectIntervention({
      sessionId: "00000000-0000-0000-0000-000000000001",
      conceptId: "concept_range_vs_len",
      strugglePattern: "none",
    });

    const arg = mockCall.mock.calls[0][0];
    expect(arg).toHaveProperty("output_schema");
  });

  it("returns a valid InterventionDecision", async () => {
    const decision = makeDecision({ tier: 2, deliveryChannel: "codelens" });
    mockCall.mockResolvedValue(makeCallResponse(decision));

    const result = await selectIntervention({
      sessionId: "00000000-0000-0000-0000-000000000001",
      conceptId: "concept_range_vs_len",
      strugglePattern: "conceptual_gap",
    });

    expect(result.tier).toBe(2);
    expect(result.deliveryChannel).toBe("codelens");
    expect(result.conceptId).toBe("concept_range_vs_len");
  });

  it("uses temperature 0.2 (low for consistent tier selection)", async () => {
    mockCall.mockResolvedValue(makeCallResponse(makeDecision()));

    await selectIntervention({
      sessionId: "00000000-0000-0000-0000-000000000001",
      conceptId: "concept_range_vs_len",
      strugglePattern: "none",
    });

    const arg = mockCall.mock.calls[0][0];
    expect(arg.temperature).toBe(0.2);
  });

  it("wraps input in user_input tags", async () => {
    mockCall.mockResolvedValue(makeCallResponse(makeDecision()));

    await selectIntervention({
      sessionId: "00000000-0000-0000-0000-000000000001",
      conceptId: "concept_range_vs_len",
      strugglePattern: "integration",
    });

    const arg = mockCall.mock.calls[0][0];
    const userMessage = arg.messages[0];
    expect(userMessage.role).toBe("user");
    const content = userMessage.content as string;
    expect(content).toContain("<user_input>");
    expect(content).toContain("</user_input>");
  });

  it("includes strugglePattern in the payload sent to the model", async () => {
    mockCall.mockResolvedValue(makeCallResponse(makeDecision({ tier: 5 })));

    await selectIntervention({
      sessionId: "00000000-0000-0000-0000-000000000001",
      conceptId: "concept_async_basics",
      strugglePattern: "conceptual_gap",
    });

    const arg = mockCall.mock.calls[0][0];
    const content = arg.messages[0].content as string;
    expect(content).toContain("conceptual_gap");
  });

  it("forwards preferredChannel when provided", async () => {
    mockCall.mockResolvedValue(makeCallResponse(makeDecision({ deliveryChannel: "notebook" })));

    await selectIntervention({
      sessionId: "00000000-0000-0000-0000-000000000001",
      conceptId: "concept_range_vs_len",
      strugglePattern: "none",
      preferredChannel: "notebook",
    });

    const arg = mockCall.mock.calls[0][0];
    const content = arg.messages[0].content as string;
    expect(content).toContain("notebook");
  });
});

// ---------------------------------------------------------------------------
// generateTierContent dispatch tests
// ---------------------------------------------------------------------------

describe("generateTierContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Tier 1: Socratic nudge (Haiku) ----

  describe("Tier 1 — Socratic nudge", () => {
    it("calls Haiku for tier 1", async () => {
      mockCall.mockResolvedValue({
        parsed: "What happens if `len()` returns an integer — how do you iterate?",
        usage: { input_tokens: 60, output_tokens: 20, cache_read_input_tokens: 50 },
        raw: {} as never,
      });

      const decision = makeDecision({ tier: 1, deliveryChannel: "chat" });
      await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      expect(mockCall).toHaveBeenCalledOnce();
      const arg = mockCall.mock.calls[0][0];
      expect(arg.model).toBe("haiku");
    });

    it("tier 1 returns content_md string", async () => {
      const nudgeText = "What happens if `len()` returns an integer?";
      mockCall.mockResolvedValue({
        parsed: nudgeText,
        usage: { input_tokens: 60, output_tokens: 20, cache_read_input_tokens: 50 },
        raw: {} as never,
      });

      const decision = makeDecision({ tier: 1 });
      const result = await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      expect(result).toHaveProperty("content_md");
      expect(typeof result.content_md).toBe("string");
    });

    it("tier 1 uses temperature 0.4", async () => {
      mockCall.mockResolvedValue({
        parsed: "Some question?",
        usage: { input_tokens: 60, output_tokens: 20, cache_read_input_tokens: 50 },
        raw: {} as never,
      });

      const decision = makeDecision({ tier: 1 });
      await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      const arg = mockCall.mock.calls[0][0];
      expect(arg.temperature).toBe(0.4);
    });
  });

  // ---- Tier 2: MCQ probe (Haiku) ----

  describe("Tier 2 — MCQ probe", () => {
    const validMCQResponse = {
      parsed: {
        questions: [
          { q: "Q1?", choices: ["A", "B", "C", "D"], correctIndex: 0, explanation: "Because A." },
          { q: "Q2?", choices: ["A", "B", "C", "D"], correctIndex: 1, explanation: "Because B." },
          { q: "Q3?", choices: ["A", "B", "C", "D"], correctIndex: 2, explanation: "Because C." },
        ],
      },
      usage: { input_tokens: 150, output_tokens: 80, cache_read_input_tokens: 120 },
      raw: {} as never,
    };

    it("calls Haiku for tier 2", async () => {
      mockCall.mockResolvedValue(validMCQResponse);

      const decision = makeDecision({ tier: 2, deliveryChannel: "codelens" });
      await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      expect(mockCall).toHaveBeenCalledOnce();
      const arg = mockCall.mock.calls[0][0];
      expect(arg.model).toBe("haiku");
    });

    it("tier 2 has output_schema for structured MCQ output", async () => {
      mockCall.mockResolvedValue(validMCQResponse);

      const decision = makeDecision({ tier: 2 });
      await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      const arg = mockCall.mock.calls[0][0];
      expect(arg).toHaveProperty("output_schema");
    });

    it("tier 2 returns 3 MCQs in payload", async () => {
      mockCall.mockResolvedValue(validMCQResponse);

      const decision = makeDecision({ tier: 2 });
      const result = await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      expect(result.payload).toBeDefined();
      const payload = result.payload as { questions: unknown[] };
      expect(payload.questions).toHaveLength(3);
    });

    it("tier 2 content_md summarizes the MCQs", async () => {
      mockCall.mockResolvedValue(validMCQResponse);

      const decision = makeDecision({ tier: 2 });
      const result = await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      expect(result.content_md).toContain("Q1");
      expect(result.content_md).toContain("Q2");
      expect(result.content_md).toContain("Q3");
    });

    it("tier 2 uses temperature 0.3", async () => {
      mockCall.mockResolvedValue(validMCQResponse);

      const decision = makeDecision({ tier: 2 });
      await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      const arg = mockCall.mock.calls[0][0];
      expect(arg.temperature).toBe(0.3);
    });
  });

  // ---- Tier 3: Micro-lesson (delegates to generateLesson) ----

  describe("Tier 3 — Micro-lesson", () => {
    it("tier 3 returns content_md from lesson body", async () => {
      const decision = makeDecision({ tier: 3, deliveryChannel: "notebook" });
      const result = await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      // curriculum mock returns bodyMd: "# Lesson\n\nContent here."
      expect(result.content_md).toBe("# Lesson\n\nContent here.");
    });

    it("tier 3 includes lesson in payload", async () => {
      const decision = makeDecision({ tier: 3 });
      const result = await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      expect(result.payload).toBeDefined();
      const payload = result.payload as { lesson: unknown };
      expect(payload.lesson).toBeDefined();
    });

    it("tier 3 does NOT call mockCall directly (delegates to curriculum)", async () => {
      // No mockCall setup — if tier 3 called call() directly it would fail/return undefined
      const decision = makeDecision({ tier: 3 });

      // Should not throw because generateLesson (mocked) is used
      await expect(
        generateTierContent(decision, "00000000-0000-0000-0000-000000000001")
      ).resolves.toBeDefined();

      // call() should NOT have been invoked for tier 3
      expect(mockCall).not.toHaveBeenCalled();
    });
  });

  // ---- Tier 4: Pair debug signal ----

  describe("Tier 4 — Pair debug", () => {
    it("tier 4 returns a pair-debug action signal without calling AI", async () => {
      const decision = makeDecision({ tier: 4, deliveryChannel: "debug" });
      const result = await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      expect(mockCall).not.toHaveBeenCalled();
      expect(result.payload).toMatchObject({
        action: "start_pair_debug",
        conceptId: decision.conceptId,
      });
    });

    it("tier 4 content_md mentions pair-debug", async () => {
      const decision = makeDecision({ tier: 4 });
      const result = await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      expect(result.content_md.toLowerCase()).toContain("pair");
    });
  });

  // ---- Tier 5: Regression bridging (Opus) ----

  describe("Tier 5 — Prerequisite regression", () => {
    it("calls Opus for tier 5", async () => {
      mockCall.mockResolvedValue({
        parsed: "Before tackling async/await, let's review concept_callbacks. Let's review concept_callbacks first, then come back to concept_async_basics.",
        usage: { input_tokens: 150, output_tokens: 80, cache_read_input_tokens: 100 },
        raw: {} as never,
      });

      const decision = makeDecision({
        tier: 5,
        conceptId: "concept_async_basics",
        deliveryChannel: "chat",
      });
      await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      expect(mockCall).toHaveBeenCalledOnce();
      const arg = mockCall.mock.calls[0][0];
      expect(arg.model).toBe("opus");
    });

    it("tier 5 returns a prereqConceptId in payload", async () => {
      mockCall.mockResolvedValue({
        parsed: "Let's review the basics first.",
        usage: { input_tokens: 150, output_tokens: 80, cache_read_input_tokens: 100 },
        raw: {} as never,
      });

      const decision = makeDecision({ tier: 5, conceptId: "concept_async_basics" });
      const result = await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      expect(result.payload).toBeDefined();
      const payload = result.payload as { prereqConceptId: string };
      expect(typeof payload.prereqConceptId).toBe("string");
    });

    it("tier 5 uses temperature 0.3", async () => {
      mockCall.mockResolvedValue({
        parsed: "Review prereq first.",
        usage: { input_tokens: 150, output_tokens: 80, cache_read_input_tokens: 100 },
        raw: {} as never,
      });

      const decision = makeDecision({ tier: 5 });
      await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      const arg = mockCall.mock.calls[0][0];
      expect(arg.temperature).toBe(0.3);
    });
  });

  // ---- Default / unknown tier ----

  describe("unknown tier", () => {
    it("returns empty content_md for an unknown tier", async () => {
      const decision = makeDecision({ tier: 99 as never });
      const result = await generateTierContent(decision, "00000000-0000-0000-0000-000000000001");

      expect(result.content_md).toBe("");
    });
  });
});

// ---------------------------------------------------------------------------
// Tier 1 system prompt content test
// ---------------------------------------------------------------------------

describe("selectIntervention system prompt rules", () => {
  it("includes tier rules in the system prompt extra", async () => {
    mockCall.mockResolvedValue(makeCallResponse(makeDecision()));

    await selectIntervention({
      sessionId: "00000000-0000-0000-0000-000000000001",
      conceptId: "concept_range_vs_len",
      strugglePattern: "surface_fix",
    });

    const arg = mockCall.mock.calls[0][0];
    // system is an array of content blocks
    const systemText = JSON.stringify(arg.system);
    expect(systemText).toContain("Tier");
    expect(systemText).toContain("channel");
  });
});
