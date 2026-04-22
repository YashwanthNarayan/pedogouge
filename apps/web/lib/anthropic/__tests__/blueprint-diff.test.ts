import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the Anthropic SDK before importing the module under test
// ---------------------------------------------------------------------------
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import {
  analyzeBlueprintDiff,
  type BlueprintDiffInput,
  type BlueprintDiffOutput,
  Phase1QuestionSchema,
  InjectedBugSchema,
  CounterfactualSchema,
} from "../blueprint-diff";
import type { ConceptNode } from "@pedagogue/shared/schemas";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONCEPTS: ConceptNode[] = [
  {
    id: "c1",
    name: "Variables",
    prerequisites: [],
    masteryScore: 0.8,
    decayRate: 0.05,
    lastTestedAt: null,
    relatedErrors: [],
    strugglePattern: "none",
  },
  {
    id: "c2",
    name: "Loops",
    prerequisites: ["c1"],
    masteryScore: 0.3,  // lowest — should become weakestConcept
    decayRate: 0.05,
    lastTestedAt: null,
    relatedErrors: [],
    strugglePattern: "conceptual_gap",
  },
  {
    id: "c3",
    name: "Functions",
    prerequisites: ["c1"],
    masteryScore: 0.6,
    decayRate: 0.05,
    lastTestedAt: null,
    relatedErrors: [],
    strugglePattern: "none",
  },
];

const BLUEPRINT = {
  title: "Habit Tracker",
  summary: "A habit tracker app with daily streaks.",
  features: [
    {
      id: "f1",
      name: "Add habit",
      userStory: "As a user I want to add habits",
      acceptanceCriteria: ["Can create a habit"],
      complexity: "easy" as const,
      conceptIds: ["c1"],
    },
    {
      id: "f2",
      name: "Streak counter",
      userStory: "As a user I want to track streaks",
      acceptanceCriteria: ["Shows current streak"],
      complexity: "medium" as const,
      conceptIds: ["c2"],
    },
    {
      id: "f3",
      name: "History view",
      userStory: "As a user I want to see history",
      acceptanceCriteria: ["Shows past 30 days"],
      complexity: "medium" as const,
      conceptIds: ["c3"],
    },
  ],
  dataModels: [
    { name: "Habit", fields: [{ name: "id", type: "string" }] },
  ],
  apiSurface: [{ method: "POST", path: "/habits", purpose: "Create a habit" }],
  conceptGraph: [
    { id: "c1", name: "Variables", prerequisites: [], estimatedMinutes: 30 },
    { id: "c2", name: "Loops", prerequisites: ["c1"], estimatedMinutes: 60 },
    { id: "c3", name: "Functions", prerequisites: ["c1"], estimatedMinutes: 45 },
  ],
  scopedMvp: ["f1", "f2"],
  ambiguities: [],
  recommendedLanguage: "python" as const,
  starterRepo: {
    files: [{ path: "main.py", content: "# starter\n" }],
    testCmd: "python -m pytest",
  },
};

const SNAPSHOTS = [
  { filePath: "main.py", content: "habits = []\n\ndef add_habit(name):\n    habits.append(name)\n", capturedAt: "2026-04-21T10:00:00Z" },
];

const VALID_TOOL_OUTPUT = {
  conceptsCovered: ["c1", "c3"],
  conceptsSkipped: ["c2"],
  phase1Questions: [
    { id: "q1", text: "Why did you store habits in a list?", conceptId: "c1", difficulty: "easy" as const },
    { id: "q2", text: "How does your streak logic handle a missed day?", conceptId: "c2", difficulty: "medium" as const },
    { id: "q3", text: "What happens if the same habit is added twice?", conceptId: "c1", difficulty: "easy" as const },
    { id: "q4", text: "How would you persist habits across restarts?", conceptId: "c3", difficulty: "hard" as const },
    { id: "q5", text: "Why did you choose a list over a dict for storage?", conceptId: "c1", difficulty: "medium" as const },
  ],
  phase2Bug: {
    conceptId: "c2",
    filePath: "main.py",
    originalLine: "    habits.append(name)",
    patchedLine: "    habits.insert(0, name)",
    bugDescription: "Inserts at head instead of tail — breaks chronological streak logic.",
    expectedFixHint: "Think about whether order matters for the streak counter.",
  },
  phase3Counterfactuals: [
    { id: "cf1", question: "If you had 1 million users, how would you scale the streak logic?", conceptIds: ["c2"] },
    { id: "cf2", question: "How would you add a collaborative challenge feature?", conceptIds: ["c3"] },
    { id: "cf3", question: "How would you write a regression test for the streak counter?", conceptIds: ["c2", "c3"] },
  ],
};

function makeToolUseResponse(toolOutput: typeof VALID_TOOL_OUTPUT) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: "tu_1",
        name: "produce_defense_seeds",
        input: toolOutput,
      },
    ],
    model: "claude-sonnet-4-6",
    stop_reason: "tool_use",
    usage: { input_tokens: 100, output_tokens: 200 },
  };
}

const BASE_INPUT: BlueprintDiffInput = {
  blueprint: BLUEPRINT,
  editorSnapshots: SNAPSHOTS,
  conceptNodes: CONCEPTS,
  sessionId: "session-123",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("analyzeBlueprintDiff", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns valid BlueprintDiffOutput for happy-path response", async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(VALID_TOOL_OUTPUT));

    const result = await analyzeBlueprintDiff(BASE_INPUT);

    expect(result.conceptsCovered).toEqual(["c1", "c3"]);
    expect(result.conceptsSkipped).toEqual(["c2"]);
  });

  it("weakestConcept is the concept with the lowest masteryScore", async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(VALID_TOOL_OUTPUT));

    const result = await analyzeBlueprintDiff(BASE_INPUT);

    expect(result.weakestConcept.id).toBe("c2");
    expect(result.weakestConcept.masteryScore).toBe(0.3);
  });

  it("phase1Questions has 5-8 items, each conforming to the schema", async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(VALID_TOOL_OUTPUT));

    const result = await analyzeBlueprintDiff(BASE_INPUT);

    expect(result.phase1Questions.length).toBeGreaterThanOrEqual(5);
    expect(result.phase1Questions.length).toBeLessThanOrEqual(8);
    for (const q of result.phase1Questions) {
      expect(() => Phase1QuestionSchema.parse(q)).not.toThrow();
    }
  });

  it("phase2Bug has non-empty patchedLine and conforms to schema", async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(VALID_TOOL_OUTPUT));

    const result = await analyzeBlueprintDiff(BASE_INPUT);

    expect(result.phase2Bug.patchedLine.length).toBeGreaterThan(0);
    expect(() => InjectedBugSchema.parse(result.phase2Bug)).not.toThrow();
  });

  it("phase3Counterfactuals has exactly 3 items conforming to schema", async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(VALID_TOOL_OUTPUT));

    const result = await analyzeBlueprintDiff(BASE_INPUT);

    expect(result.phase3Counterfactuals).toHaveLength(3);
    for (const cf of result.phase3Counterfactuals) {
      expect(() => CounterfactualSchema.parse(cf)).not.toThrow();
    }
  });

  it("throws when model does not call produce_defense_seeds", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "msg_2",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Here is my analysis..." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 50, output_tokens: 20 },
    });

    await expect(analyzeBlueprintDiff(BASE_INPUT)).rejects.toThrow(
      "produce_defense_seeds",
    );
  });

  it("throws when conceptNodes is empty", async () => {
    await expect(
      analyzeBlueprintDiff({ ...BASE_INPUT, conceptNodes: [] }),
    ).rejects.toThrow("conceptNodes must not be empty");
  });

  it("throws when tool output fails Zod validation", async () => {
    const badOutput = {
      ...VALID_TOOL_OUTPUT,
      phase1Questions: [
        // Only 2 questions — below the minimum of 5
        { id: "q1", text: "Question 1", conceptId: "c1", difficulty: "easy" },
        { id: "q2", text: "Question 2", conceptId: "c2", difficulty: "medium" },
      ],
    };
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(badOutput as typeof VALID_TOOL_OUTPUT));

    await expect(analyzeBlueprintDiff(BASE_INPUT)).rejects.toThrow();
  });

  it("passes blueprint + snapshot blocks to the Anthropic SDK", async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(VALID_TOOL_OUTPUT));

    await analyzeBlueprintDiff(BASE_INPUT);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const call = mockCreate.mock.calls[0]![0];
    expect(call.tool_choice).toEqual({ type: "any" });
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0].name).toBe("produce_defense_seeds");
    // Two system blocks: preamble+blueprint (1h) and snapshots+concepts (5m)
    expect(call.system).toHaveLength(2);
    expect(call.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(call.system[1].cache_control).toEqual({ type: "ephemeral" });
    // Blueprint JSON is in the first block
    expect(call.system[0].text).toContain("Habit Tracker");
  });
});
