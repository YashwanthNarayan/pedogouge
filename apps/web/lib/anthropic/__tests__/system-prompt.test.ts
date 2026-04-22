import { describe, it, expect } from "vitest";
import { assembleSystemPrompt } from "../system-prompt";

describe("assembleSystemPrompt", () => {
  const BASE_OPTS = {
    role: "tutor",
    blueprint: { title: "Habit Tracker" },
    graph: { nodes: [] },
  };

  it("produces preamble + blueprint + graph blocks when no memories", () => {
    const blocks = assembleSystemPrompt(BASE_OPTS);
    expect(blocks).toHaveLength(3);
    const texts = blocks.map((b) => b.text);
    expect(texts[0]).toContain("ROLE: tutor");
    expect(texts[1]).toContain("blueprint");
    expect(texts[2]).toContain("skill_graph");
  });

  it("inserts memory block between blueprint and graph when userMemories present", () => {
    const blocks = assembleSystemPrompt({
      ...BASE_OPTS,
      userMemories: ["prev session: worked on loops", "prev session: recursion struggles"],
    });
    expect(blocks).toHaveLength(4);
    expect(blocks[2]!.text).toContain("Student cross-session memory");
    expect(blocks[2]!.text).toContain("prev session: worked on loops");
    expect(blocks[2]!.text).toContain("---");
    expect(blocks[2]!.text).toContain("prev session: recursion struggles");
    // graph is still last
    expect(blocks[3]!.text).toContain("skill_graph");
  });

  it("memory block has ephemeral cache_control", () => {
    const blocks = assembleSystemPrompt({
      ...BASE_OPTS,
      userMemories: ["some memory"],
    });
    const memBlock = blocks.find((b) => b.text.includes("cross-session memory"));
    expect(memBlock?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("userMemories empty array → no memory block (same output as undefined)", () => {
    const withEmpty = assembleSystemPrompt({ ...BASE_OPTS, userMemories: [] });
    const withUndefined = assembleSystemPrompt(BASE_OPTS);
    expect(withEmpty).toHaveLength(withUndefined.length);
    expect(withEmpty.map((b) => b.text)).toEqual(withUndefined.map((b) => b.text));
  });

  it("userMemories undefined → no regression (3 blocks as before)", () => {
    const blocks = assembleSystemPrompt(BASE_OPTS);
    expect(blocks.every((b) => !b.text.includes("cross-session"))).toBe(true);
  });

  it("canary is injected into first (preamble) block", () => {
    const blocks = assembleSystemPrompt({ ...BASE_OPTS, canary: "TESTCANARY" });
    expect(blocks[0]!.text).toContain("TESTCANARY");
  });

  it("events block appended after graph", () => {
    const blocks = assembleSystemPrompt({ ...BASE_OPTS, events: [{ type: "submit" }] });
    expect(blocks).toHaveLength(4);
    expect(blocks[3]!.text).toContain("recent_events");
  });

  it("memories + events: order is preamble → blueprint → memory → graph → events", () => {
    const blocks = assembleSystemPrompt({
      ...BASE_OPTS,
      userMemories: ["mem1"],
      events: [{ type: "test" }],
    });
    expect(blocks).toHaveLength(5);
    expect(blocks[0]!.text).toContain("ROLE");
    expect(blocks[1]!.text).toContain("blueprint");
    expect(blocks[2]!.text).toContain("cross-session memory");
    expect(blocks[3]!.text).toContain("skill_graph");
    expect(blocks[4]!.text).toContain("recent_events");
  });
});
