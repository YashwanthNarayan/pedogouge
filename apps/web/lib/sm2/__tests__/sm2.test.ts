import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeNextReview,
  gradeFromMastery,
  upsertSchedule,
  SM2_INITIAL_EASE,
  SM2_MIN_EASE,
  type SM2Row,
  type SM2Grade,
} from "../index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<SM2Row> = {}): SM2Row {
  return {
    userId: "user-1",
    conceptId: "c-loops",
    nextDueAt: new Date(),
    ease: SM2_INITIAL_EASE,
    intervalDays: 1,
    reps: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeNextReview
// ---------------------------------------------------------------------------

describe("computeNextReview", () => {
  it("grade 0 (fail): resets reps to 0 and interval to 1", () => {
    const row = makeRow({ reps: 5, intervalDays: 20, ease: 2.1 });
    const next = computeNextReview(row, 0);
    expect(next.reps).toBe(0);
    expect(next.intervalDays).toBe(1);
    expect(next.ease).toBeCloseTo(2.1); // ease unchanged on fail
  });

  it("grade 2 (fail): resets reps to 0 and interval to 1", () => {
    const row = makeRow({ reps: 3, intervalDays: 10, ease: 2.3 });
    const next = computeNextReview(row, 2);
    expect(next.reps).toBe(0);
    expect(next.intervalDays).toBe(1);
    expect(next.ease).toBeCloseTo(2.3);
  });

  it("grade 3 (pass, reps=0): interval=1, reps becomes 1", () => {
    const row = makeRow({ reps: 0 });
    const next = computeNextReview(row, 3);
    expect(next.intervalDays).toBe(1);
    expect(next.reps).toBe(1);
  });

  it("grade 4 (pass, reps=1): interval=6, reps becomes 2", () => {
    const row = makeRow({ reps: 1, intervalDays: 1 });
    const next = computeNextReview(row, 4);
    expect(next.intervalDays).toBe(6);
    expect(next.reps).toBe(2);
  });

  it("grade 5 (pass, reps=2): interval = round(prev * ease)", () => {
    const row = makeRow({ reps: 2, intervalDays: 6, ease: 2.5 });
    const next = computeNextReview(row, 5);
    expect(next.intervalDays).toBe(Math.round(6 * 2.5)); // 15
    expect(next.reps).toBe(3);
  });

  it("grade 5 increases ease", () => {
    const row = makeRow({ ease: 2.5 });
    const next = computeNextReview(row, 5);
    // ease + 0.1 - 0*(0.08+0*0.02) = ease + 0.1
    expect(next.ease).toBeCloseTo(2.6, 5);
  });

  it("grade 3 decreases ease", () => {
    const row = makeRow({ ease: 2.5 });
    const next = computeNextReview(row, 3);
    // ease + 0.1 - 2*(0.08+2*0.02) = 2.5 + 0.1 - 2*0.12 = 2.5 - 0.14 = 2.36
    expect(next.ease).toBeCloseTo(2.36, 5);
  });

  it("ease is floored at SM2_MIN_EASE (1.3)", () => {
    const row = makeRow({ ease: 1.31 });
    // grade 3: delta = 0.1 - 2*(0.08+0.04) = 0.1 - 0.24 = -0.14 → 1.31 - 0.14 = 1.17 → floored
    const next = computeNextReview(row, 3);
    expect(next.ease).toBeGreaterThanOrEqual(SM2_MIN_EASE);
  });

  it("nextDueAt is in the future after a passing grade", () => {
    const row = makeRow({ reps: 1, intervalDays: 1 });
    const next = computeNextReview(row, 4);
    expect(next.nextDueAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("interval progression 1 → 6 → n*ease across three passing grades", () => {
    let row = makeRow({ reps: 0 });
    const n1 = computeNextReview(row, 5);
    expect(n1.intervalDays).toBe(1);

    row = { ...row, reps: 1, intervalDays: 1, ease: n1.ease };
    const n2 = computeNextReview(row, 5);
    expect(n2.intervalDays).toBe(6);

    row = { ...row, reps: 2, intervalDays: 6, ease: n2.ease };
    const n3 = computeNextReview(row, 5);
    expect(n3.intervalDays).toBe(Math.round(6 * n2.ease));
  });
});

// ---------------------------------------------------------------------------
// gradeFromMastery
// ---------------------------------------------------------------------------

describe("gradeFromMastery", () => {
  const cases: Array<[number, SM2Grade]> = [
    [0,    1],
    [0.1,  1],
    [0.29, 1],
    [0.3,  2],
    [0.49, 2],
    [0.5,  3],
    [0.59, 3],
    [0.6,  4],
    [0.74, 4],
    [0.75, 5],
    [1.0,  5],
  ];

  it.each(cases)("mastery %s → grade %s", (mastery, expected) => {
    expect(gradeFromMastery(mastery)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// upsertSchedule — fake in-memory Supabase
// ---------------------------------------------------------------------------

function makeFakeSupabase(initial?: Record<string, unknown> | null) {
  let stored = initial ?? null;

  const chain = () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: stored, error: null }),
        }),
      }),
    }),
    upsert: async (data: Record<string, unknown>) => {
      stored = { ...data };
      return { data: stored, error: null };
    },
  });

  return {
    getStored: () => stored,
    from: (_table: string) => chain(),
  };
}

describe("upsertSchedule", () => {
  it("creates a new row when no existing record", async () => {
    const db = makeFakeSupabase(null);
    const result = await upsertSchedule("u1", "c1", 5, db);

    expect(result.userId).toBe("u1");
    expect(result.conceptId).toBe("c1");
    // First pass (reps=0): interval = 1, reps becomes 1
    expect(result.intervalDays).toBe(1);
    expect(result.reps).toBe(1);
  });

  it("updates an existing row on repeat review", async () => {
    const db = makeFakeSupabase({
      user_id: "u1",
      concept_id: "c1",
      next_due_at: new Date().toISOString(),
      ease: 2.5,
      interval_days: 1,
      reps: 1,
    });

    const result = await upsertSchedule("u1", "c1", 5, db);

    // reps=1 → interval=6, reps becomes 2
    expect(result.intervalDays).toBe(6);
    expect(result.reps).toBe(2);
  });

  it("persists upsert payload with correct DB column names", async () => {
    const db = makeFakeSupabase(null);
    await upsertSchedule("user-abc", "concept-xyz", 4, db);

    const stored = db.getStored() as Record<string, unknown>;
    expect(stored.user_id).toBe("user-abc");
    expect(stored.concept_id).toBe("concept-xyz");
    expect(typeof stored.next_due_at).toBe("string");
    expect(typeof stored.ease).toBe("number");
    expect(typeof stored.interval_days).toBe("number");
    expect(typeof stored.reps).toBe("number");
  });

  it("grade 0 resets interval to 1 even for experienced row", async () => {
    const db = makeFakeSupabase({
      user_id: "u1",
      concept_id: "c1",
      next_due_at: new Date().toISOString(),
      ease: 2.1,
      interval_days: 30,
      reps: 5,
    });

    const result = await upsertSchedule("u1", "c1", 0, db);
    expect(result.intervalDays).toBe(1);
    expect(result.reps).toBe(0);
  });

  it("grade 5 with reps=1 sets next_due_at ~6 days out", async () => {
    const db = makeFakeSupabase({
      user_id: "u1",
      concept_id: "c1",
      next_due_at: new Date().toISOString(),
      ease: SM2_INITIAL_EASE,
      interval_days: 1,
      reps: 1,
    });

    const result = await upsertSchedule("u1", "c1", 5, db);

    expect(result.intervalDays).toBe(6);
    const msOut = result.nextDueAt.getTime() - Date.now();
    const daysOut = msOut / (1000 * 60 * 60 * 24);
    expect(daysOut).toBeGreaterThan(5.9);
    expect(daysOut).toBeLessThan(6.1);
  });
});
