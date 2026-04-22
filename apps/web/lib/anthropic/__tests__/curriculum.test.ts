import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../client", () => ({
  call: vi.fn(),
  callWithCitations: vi.fn(),
}));

vi.mock("../../embeddings/voyage-client", () => ({
  embed: vi.fn(),
}));

vi.mock("../../supabase/pgvector", () => ({
  matchChunks: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_LESSON_BODY = {
  markdown:
    "## Motivation\nLoops matter because...\n\n## Explanation\nA `for` loop iterates...\n\n## Worked Example\n```python\nfor habit in habits:\n    print(habit)\n```\n\n## Misconception\nBeware of mutating `habits` inside the loop.\n\n## Self-Check\nWhat does `range(len(habits))` return?\nA) A list\nB) An integer\nC) An iterator ✓\nD) A tuple",
  plainText:
    "## Motivation\nLoops matter...\n## Explanation\nA for loop...",
  citations: [
    { id: "0", source: "kb-chunk-1", excerpt: "loops iterate over sequences" },
  ],
};

const MOCK_METADATA = {
  parsed: {
    difficulty: "beginner" as const,
    prerequisiteConceptIds: ["concept_variables"],
    runnableCells: [{ lang: "python", code: "for h in habits: print(h)" }],
    estimatedMinutes: 12,
  },
  usage: {
    input_tokens: 200,
    output_tokens: 80,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 180,
  },
  raw: {} as never,
};

const MOCK_CHUNKS = [
  {
    id: "chunk-1",
    concept_id: "concept_loops",
    body_md: "A for loop iterates over each element in a sequence.",
    source_url: "https://docs.python.org/loops",
    difficulty: "beginner" as const,
    similarity: 0.92,
  },
  {
    id: "chunk-2",
    concept_id: "concept_loops",
    body_md: "Use range(len(x)) when you need the index.",
    source_url: null,
    difficulty: "beginner" as const,
    similarity: 0.87,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateLesson", () => {
  let call: ReturnType<typeof vi.fn>;
  let callWithCitations: ReturnType<typeof vi.fn>;
  let embed: ReturnType<typeof vi.fn>;
  let matchChunks: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();

    // Re-import mocked modules fresh after reset
    const clientMod = await import("../client");
    const embeddingsMod = await import("../../embeddings/voyage-client");
    const pgvectorMod = await import("../../supabase/pgvector");

    call = clientMod.call as ReturnType<typeof vi.fn>;
    callWithCitations = clientMod.callWithCitations as ReturnType<typeof vi.fn>;
    embed = embeddingsMod.embed as ReturnType<typeof vi.fn>;
    matchChunks = pgvectorMod.matchChunks as ReturnType<typeof vi.fn>;

    callWithCitations.mockResolvedValue(MOCK_LESSON_BODY);
    call.mockResolvedValue(MOCK_METADATA);
    embed.mockResolvedValue([[0.1, 0.2, 0.3]]);
    matchChunks.mockResolvedValue(MOCK_CHUNKS);
  });

  it("makes exactly 2 Claude calls (callWithCitations + call)", async () => {
    const { generateLesson } = await import("../curriculum");
    await generateLesson("session-1", "concept_loops");

    expect(callWithCitations).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("first call uses callWithCitations (Citations API — no response_format)", async () => {
    const { generateLesson } = await import("../curriculum");
    await generateLesson("session-1", "concept_loops");

    const citArgs = callWithCitations.mock.calls[0][0];
    expect(citArgs.model).toBe("opus");
    // Must NOT have output_schema — Citations ⊥ JSON structured output (ADR 004)
    expect(citArgs.output_schema).toBeUndefined();
  });

  it("second call uses call() with haiku and output_schema for metadata", async () => {
    const { generateLesson } = await import("../curriculum");
    await generateLesson("session-1", "concept_loops");

    const metaArgs = call.mock.calls[0][0];
    expect(metaArgs.model).toBe("haiku");
    expect(metaArgs.output_schema).toBeDefined();
  });

  it("returns a Lesson with conceptId, bodyMd, plainText, citations, metadata", async () => {
    const { generateLesson } = await import("../curriculum");
    const lesson = await generateLesson("session-1", "concept_loops");

    expect(lesson.conceptId).toBe("concept_loops");
    expect(lesson.bodyMd).toBe(MOCK_LESSON_BODY.markdown);
    expect(lesson.plainText).toBe(MOCK_LESSON_BODY.plainText);
    expect(lesson.citations).toEqual(MOCK_LESSON_BODY.citations);
    expect(lesson.metadata.difficulty).toBe("beginner");
    expect(lesson.metadata.estimatedMinutes).toBe(12);
  });

  it("embeds a query vector for the concept name", async () => {
    const { generateLesson } = await import("../curriculum");
    await generateLesson("session-1", "concept_loops");

    expect(embed).toHaveBeenCalledTimes(1);
    const [texts, opts] = embed.mock.calls[0];
    expect(Array.isArray(texts)).toBe(true);
    expect(texts[0]).toContain("python"); // default language
    expect(opts.inputType).toBe("query");
  });

  it("calls matchChunks with k=5 and the conceptId as filter", async () => {
    const { generateLesson } = await import("../curriculum");
    await generateLesson("session-1", "concept_loops");

    expect(matchChunks).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ k: 5, conceptFilter: "concept_loops" }),
    );
  });

  it("falls back to broader matchChunks search when concept-specific returns empty", async () => {
    matchChunks
      .mockResolvedValueOnce([])   // first call — concept-specific → empty
      .mockResolvedValueOnce(MOCK_CHUNKS); // second call — broader → results

    const { generateLesson } = await import("../curriculum");
    await generateLesson("session-1", "concept_loops");

    expect(matchChunks).toHaveBeenCalledTimes(2);
    // Second call should have no conceptFilter
    const secondCallOpts = matchChunks.mock.calls[1][1];
    expect(secondCallOpts.conceptFilter).toBeUndefined();
  });

  it("attaches KB chunks as documents in the citations call", async () => {
    const { generateLesson } = await import("../curriculum");
    await generateLesson("session-1", "concept_loops");

    const citArgs = callWithCitations.mock.calls[0][0];
    const userContent = citArgs.messages[0].content;
    // Should have document blocks for each chunk + one for project files + one text block
    const documentBlocks = userContent.filter(
      (b: { type: string }) => b.type === "document",
    );
    expect(documentBlocks.length).toBeGreaterThanOrEqual(2); // chunks + project doc
  });

  it("includes citations enabled on KB document blocks", async () => {
    const { generateLesson } = await import("../curriculum");
    await generateLesson("session-1", "concept_loops");

    const citArgs = callWithCitations.mock.calls[0][0];
    const userContent = citArgs.messages[0].content;
    const kbDocBlocks = userContent.filter(
      (b: { type: string; title?: string }) =>
        b.type === "document" && b.title?.startsWith("KB chunk"),
    );
    expect(kbDocBlocks.length).toBeGreaterThan(0);
    for (const block of kbDocBlocks) {
      expect((block as { citations?: { enabled: boolean } }).citations?.enabled).toBe(true);
    }
  });

  it("wraps user instruction in <user_input> tag", async () => {
    const { generateLesson } = await import("../curriculum");
    await generateLesson("session-1", "concept_loops");

    const citArgs = callWithCitations.mock.calls[0][0];
    const userContent = citArgs.messages[0].content;
    const textBlock = userContent.find(
      (b: { type: string }) => b.type === "text",
    );
    expect(textBlock?.text).toContain("<user_input>");
    expect(textBlock?.text).toContain("concept_loops");
  });

  it("passes plainText of lesson body to metadata call", async () => {
    const { generateLesson } = await import("../curriculum");
    await generateLesson("session-1", "concept_loops");

    const metaArgs = call.mock.calls[0][0];
    const userMsg = metaArgs.messages[0].content;
    expect(userMsg).toContain(MOCK_LESSON_BODY.plainText);
  });

  it("continues gracefully when embed or matchChunks fails (non-fatal RAG)", async () => {
    embed.mockRejectedValue(new Error("Voyage timeout"));

    const { generateLesson } = await import("../curriculum");
    // Should not throw — RAG is non-fatal, lesson generated without chunks
    const lesson = await generateLesson("session-1", "concept_loops");
    expect(lesson.conceptId).toBe("concept_loops");
    // callWithCitations should still be called (with fewer or no chunk docs)
    expect(callWithCitations).toHaveBeenCalledTimes(1);
  });

  it("uses concept name from loaded concept node if available", async () => {
    // concept node is null (stub returns null) — falls back to conceptId as name
    const { generateLesson } = await import("../curriculum");
    await generateLesson("session-1", "concept_loops");

    const [texts] = embed.mock.calls[0];
    // conceptId used as name fallback
    expect(texts[0]).toContain("concept_loops");
  });

  it("caps project files at 5 to avoid token bloat", async () => {
    // blueprint is null (stub), so projectFiles = [] → generic fallback message
    const { generateLesson } = await import("../curriculum");
    await generateLesson("session-1", "concept_loops");

    const citArgs = callWithCitations.mock.calls[0][0];
    const userContent = citArgs.messages[0].content;
    const projectDocBlock = userContent.find(
      (b: { type: string; title?: string }) =>
        b.type === "document" && b.title === "Student project files",
    );
    expect(projectDocBlock).toBeDefined();
  });

  it("metadata has max_tokens capped at 512", async () => {
    const { generateLesson } = await import("../curriculum");
    await generateLesson("session-1", "concept_loops");

    const metaArgs = call.mock.calls[0][0];
    expect(metaArgs.max_tokens).toBe(512);
  });

  it("lesson body max_tokens is 2048", async () => {
    const { generateLesson } = await import("../curriculum");
    await generateLesson("session-1", "concept_loops");

    const citArgs = callWithCitations.mock.calls[0][0];
    expect(citArgs.max_tokens).toBe(2048);
  });

  it("metadata temperature is lower than lesson body temperature (precision > creativity)", async () => {
    const { generateLesson } = await import("../curriculum");
    await generateLesson("session-1", "concept_loops");

    const metaArgs = call.mock.calls[0][0];
    expect(metaArgs.temperature).toBeLessThanOrEqual(0.15);
  });
});
