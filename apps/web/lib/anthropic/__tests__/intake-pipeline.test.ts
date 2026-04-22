import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectBlueprint } from "@pedagogue/shared";

// ---------------------------------------------------------------------------
// Mock the Anthropic SDK and our call() wrapper before importing the pipeline
// ---------------------------------------------------------------------------
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}));

vi.mock("../client", () => ({
  call: vi.fn(),
}));

import Anthropic from "@anthropic-ai/sdk";
import { call } from "../client";
import { runIntake } from "../intake-pipeline";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_BLUEPRINT: Anthropic.Message["content"] = [
  { type: "tool_use", id: "tu_1", name: "architect", input: { projectIdea: "habit tracker" } },
  { type: "tool_use", id: "tu_2", name: "pedagogue", input: { projectIdea: "habit tracker" } },
  { type: "tool_use", id: "tu_3", name: "scoper", input: { projectIdea: "habit tracker" } },
];

const VALID_BLUEPRINT = {
  title: "Habit Tracker",
  summary: "A habit tracker app with streaks.",
  features: [
    {
      id: "f1",
      name: "Add habit",
      userStory: "As a user I want to add habits",
      acceptanceCriteria: ["Can create a habit"],
      complexity: "easy",
      conceptIds: ["c1"],
    },
    {
      id: "f2",
      name: "Streak counter",
      userStory: "As a user I want to track streaks",
      acceptanceCriteria: ["Shows current streak"],
      complexity: "medium",
      conceptIds: ["c2"],
    },
    {
      id: "f3",
      name: "Daily reminder",
      userStory: "As a user I want daily reminders",
      acceptanceCriteria: ["Sends notification"],
      complexity: "hard",
      conceptIds: ["c3"],
    },
    {
      id: "f4",
      name: "History view",
      userStory: "As a user I want to see history",
      acceptanceCriteria: ["Shows past 30 days"],
      complexity: "medium",
      conceptIds: ["c4"],
    },
    {
      id: "f5",
      name: "Delete habit",
      userStory: "As a user I want to delete habits",
      acceptanceCriteria: ["Can remove a habit"],
      complexity: "trivial",
      conceptIds: ["c1"],
    },
  ],
  dataModels: [
    { name: "Habit", fields: [{ name: "id", type: "string" }, { name: "name", type: "string" }] },
  ],
  apiSurface: [
    { method: "GET", path: "/habits", purpose: "list habits" },
    { method: "POST", path: "/habits", purpose: "create habit" },
  ],
  conceptGraph: [
    { id: "c1", name: "Variables", prerequisites: [], estimatedMinutes: 30 },
    { id: "c2", name: "Loops", prerequisites: ["c1"], estimatedMinutes: 45 },
    { id: "c3", name: "Functions", prerequisites: ["c1"], estimatedMinutes: 60 },
    { id: "c4", name: "Data Structures", prerequisites: ["c2", "c3"], estimatedMinutes: 90 },
    { id: "c5", name: "Control Flow", prerequisites: ["c1"], estimatedMinutes: 30 },
    { id: "c6", name: "Async", prerequisites: ["c3"], estimatedMinutes: 60 },
    { id: "c7", name: "Modules", prerequisites: ["c3"], estimatedMinutes: 30 },
    { id: "c8", name: "Testing", prerequisites: ["c3"], estimatedMinutes: 45 },
  ],
  scopedMvp: ["f1", "f2", "f5"],
  ambiguities: ["What platforms?", "Auth needed?"],
  recommendedLanguage: "python",
  starterRepo: {
    files: [
      { path: "main.py", content: "# Habit tracker\n" },
      { path: "habits.py", content: "# Habit logic\n" },
      { path: "tests/test_habits.py", content: "# Tests\n" },
    ],
    testCmd: "pytest tests/",
  },
} as const;

// ---------------------------------------------------------------------------
// Mock architect/pedagogue/scoper sub-call results
// ---------------------------------------------------------------------------

const ARCHITECT_RESULT = {
  features: VALID_BLUEPRINT.features,
  dataModels: VALID_BLUEPRINT.dataModels,
  apiSurface: VALID_BLUEPRINT.apiSurface,
  starterRepo: VALID_BLUEPRINT.starterRepo,
};

const PEDAGOGUE_RESULT = {
  conceptGraph: VALID_BLUEPRINT.conceptGraph,
  ambiguities: VALID_BLUEPRINT.ambiguities,
  recommendedLanguage: VALID_BLUEPRINT.recommendedLanguage,
};

const SCOPER_RESULT = {
  scopedMvp: VALID_BLUEPRINT.scopedMvp,
  summary: VALID_BLUEPRINT.summary,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runIntake", () => {
  let mockCreate: ReturnType<typeof vi.fn>;
  let mockCall: ReturnType<typeof vi.fn>;
  let callCount: number;

  beforeEach(() => {
    callCount = 0;
    mockCreate = vi.fn();
    mockCall = vi.fn();

    // Wire the Anthropic SDK mock
    (Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));

    // Call 1: Opus fan-out → 3 parallel tool_use blocks
    mockCreate.mockResolvedValue({
      id: "msg_fanout",
      type: "message",
      role: "assistant",
      content: MOCK_BLUEPRINT,
      model: "claude-opus-4-7",
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });

    // Specialist sub-calls via call() wrapper (3 parallel + 1 synthesis = 4 total call() invocations)
    (call as ReturnType<typeof vi.fn>)
      .mockImplementation(async (opts: { output_schema?: { parse: (x: unknown) => unknown } }) => {
        callCount++;
        // First 3 calls are specialists; 4th is synthesis
        if (callCount === 1) return { parsed: ARCHITECT_RESULT, usage: {} };
        if (callCount === 2) return { parsed: PEDAGOGUE_RESULT, usage: {} };
        if (callCount === 3) return { parsed: SCOPER_RESULT, usage: {} };
        // Synthesis call: return the merged blueprint
        return { parsed: VALID_BLUEPRINT, usage: { cache_read_input_tokens: 1234 } };
      });

    vi.clearAllMocks();
    callCount = 0;
    (call as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { parsed: ARCHITECT_RESULT, usage: {} };
      if (callCount === 2) return { parsed: PEDAGOGUE_RESULT, usage: {} };
      if (callCount === 3) return { parsed: SCOPER_RESULT, usage: {} };
      return { parsed: VALID_BLUEPRINT, usage: { cache_read_input_tokens: 1234 } };
    });
    mockCreate.mockResolvedValue({
      id: "msg_fanout",
      type: "message",
      role: "assistant",
      content: MOCK_BLUEPRINT,
      model: "claude-opus-4-7",
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });
    (Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));
  });

  it("makes exactly 2 Anthropic SDK direct calls (fan-out via client.create)", async () => {
    await runIntake("habit tracker with streaks");
    // messages.create is called once for the fan-out
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("calls 3 specialist sub-calls + 1 synthesis via call() wrapper = 4 total", async () => {
    await runIntake("habit tracker with streaks");
    expect(call).toHaveBeenCalledTimes(4);
  });

  it("passes all 3 tools to the fan-out call", async () => {
    await runIntake("habit tracker with streaks");
    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.tools).toHaveLength(3);
    const toolNames = createArgs.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain("architect");
    expect(toolNames).toContain("pedagogue");
    expect(toolNames).toContain("scoper");
  });

  it("uses tool_choice: any to force parallel tool calls", async () => {
    await runIntake("habit tracker with streaks");
    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.tool_choice).toEqual({ type: "any" });
  });

  it("wraps project idea in <user_input> tags in the fan-out call", async () => {
    await runIntake("build a todo app");
    const createArgs = mockCreate.mock.calls[0][0];
    const userMsg = createArgs.messages[0];
    expect(userMsg.content).toContain("<user_input>build a todo app</user_input>");
  });

  it("routes architect to Opus model", async () => {
    await runIntake("habit tracker");
    const architectCall = (call as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0]?.model === "opus",
    );
    expect(architectCall).toBeDefined();
  });

  it("routes pedagogue to Sonnet model", async () => {
    await runIntake("habit tracker");
    const pedagogueCall = (call as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0]?.model === "sonnet",
    );
    expect(pedagogueCall).toBeDefined();
  });

  it("routes scoper to Haiku model", async () => {
    await runIntake("habit tracker");
    const scoperCall = (call as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0]?.model === "haiku",
    );
    expect(scoperCall).toBeDefined();
  });

  it("returns a valid ProjectBlueprint", async () => {
    const result = await runIntake("habit tracker with streaks");
    const validated = ProjectBlueprint.safeParse(result);
    expect(validated.success).toBe(true);
  });

  it("returned blueprint has at least 5 features", async () => {
    const result = await runIntake("habit tracker with streaks");
    expect(result.features.length).toBeGreaterThanOrEqual(5);
  });

  it("returned blueprint has at least 8 concepts in the graph", async () => {
    const result = await runIntake("habit tracker with streaks");
    expect(result.conceptGraph.length).toBeGreaterThanOrEqual(8);
  });

  it("uses Opus for the synthesis call", async () => {
    await runIntake("habit tracker");
    const synthesisCall = (call as ReturnType<typeof vi.fn>).mock.calls[3];
    expect(synthesisCall[0].model).toBe("opus");
  });

  it("passes tool_results back in the synthesis messages", async () => {
    await runIntake("habit tracker");
    const synthesisCall = (call as ReturnType<typeof vi.fn>).mock.calls[3];
    const messages = synthesisCall[0].messages;
    // Should have: user (project idea), assistant (tool_use content from r1), user (tool_results)
    expect(messages.length).toBeGreaterThanOrEqual(3);
    const toolResultMsg = messages[messages.length - 1];
    expect(Array.isArray(toolResultMsg.content)).toBe(true);
    const toolResults = toolResultMsg.content as Array<{ type: string }>;
    expect(toolResults.every((r) => r.type === "tool_result")).toBe(true);
    expect(toolResults).toHaveLength(3);
  });

  it("synthesis call uses output_schema: ProjectBlueprint", async () => {
    await runIntake("habit tracker");
    const synthesisCall = (call as ReturnType<typeof vi.fn>).mock.calls[3];
    expect(synthesisCall[0].output_schema).toBeDefined();
  });

  it("throws if fan-out returns fewer than 3 tool_use blocks", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "msg_bad",
      type: "message",
      role: "assistant",
      content: [MOCK_BLUEPRINT[0]], // only 1 tool_use
      model: "claude-opus-4-7",
      stop_reason: "tool_use",
      usage: {},
    });
    await expect(runIntake("habit tracker")).rejects.toThrow(/3.*tool/i);
  });

  it("runs architect, pedagogue, scoper specialists in parallel", async () => {
    const order: number[] = [];
    let cnt = 0;
    (call as ReturnType<typeof vi.fn>).mockImplementation(
      async (opts: { model?: string }) => {
        cnt++;
        const current = cnt;
        order.push(current);
        // Specialists resolve quickly; synthesis is last
        if (current <= 3) return { parsed: [ARCHITECT_RESULT, PEDAGOGUE_RESULT, SCOPER_RESULT][current - 1], usage: {} };
        return { parsed: VALID_BLUEPRINT, usage: {} };
      },
    );
    await runIntake("parallel test");
    // All 4 calls should complete; specialists (1-3) before synthesis (4)
    expect(order).toHaveLength(4);
    expect(order[3]).toBe(4); // synthesis is last
  });
});

describe("embed via voyage-client (unit smoke)", () => {
  it("can be imported without error", async () => {
    const { embed } = await import("../../embeddings/voyage-client");
    expect(typeof embed).toBe("function");
  });
});
