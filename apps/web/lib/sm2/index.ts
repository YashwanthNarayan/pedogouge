// ---------------------------------------------------------------------------
// SM-2 spaced-repetition algorithm
//
// Implements the classic SuperMemo SM-2 algorithm as described in:
// https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
// ---------------------------------------------------------------------------

export const SM2_INITIAL_EASE = 2.5;
export const SM2_MIN_EASE = 1.3;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDB = any;

export type SM2Row = {
  userId: string;
  conceptId: string;
  nextDueAt: Date;
  ease: number;
  intervalDays: number;
  reps: number;
};

export type SM2Grade = 0 | 1 | 2 | 3 | 4 | 5;

// ---------------------------------------------------------------------------
// Core algorithm
// ---------------------------------------------------------------------------

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function computeNextReview(
  row: SM2Row,
  grade: SM2Grade,
): Omit<SM2Row, "userId" | "conceptId"> {
  let { ease, intervalDays, reps } = row;
  let interval: number;

  if (grade < 3) {
    // Incorrect response — reset to start
    reps = 0;
    interval = 1;
    // ease unchanged
  } else {
    // Correct response
    if (reps === 0) {
      interval = 1;
    } else if (reps === 1) {
      interval = 6;
    } else {
      interval = Math.round(intervalDays * ease);
    }
    ease = Math.max(
      SM2_MIN_EASE,
      ease + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02),
    );
    reps += 1;
  }

  return {
    nextDueAt: addDays(new Date(), interval),
    ease,
    intervalDays: interval,
    reps,
  };
}

// ---------------------------------------------------------------------------
// Mastery → grade mapping
// ---------------------------------------------------------------------------

export function gradeFromMastery(masteryScore: number): SM2Grade {
  if (masteryScore < 0.3) return 1;
  if (masteryScore < 0.5) return 2;
  if (masteryScore < 0.6) return 3;
  if (masteryScore < 0.75) return 4;
  return 5;
}

// ---------------------------------------------------------------------------
// DB-backed upsert
// ---------------------------------------------------------------------------

export async function upsertSchedule(
  userId: string,
  conceptId: string,
  grade: SM2Grade,
  supabase: AnyDB,
): Promise<SM2Row> {
  // Fetch existing row
  const { data: existing } = await supabase
    .from("sm2_schedule")
    .select("user_id, concept_id, next_due_at, ease, interval_days, reps")
    .eq("user_id", userId)
    .eq("concept_id", conceptId)
    .maybeSingle();

  const currentRow: SM2Row = existing
    ? {
        userId: existing.user_id as string,
        conceptId: existing.concept_id as string,
        nextDueAt: new Date(existing.next_due_at as string),
        ease: Number(existing.ease),
        intervalDays: Number(existing.interval_days),
        reps: Number(existing.reps),
      }
    : {
        userId,
        conceptId,
        nextDueAt: new Date(),
        ease: SM2_INITIAL_EASE,
        intervalDays: 1,
        reps: 0,
      };

  const next = computeNextReview(currentRow, grade);

  await supabase.from("sm2_schedule").upsert(
    {
      user_id: userId,
      concept_id: conceptId,
      next_due_at: next.nextDueAt.toISOString(),
      ease: next.ease,
      interval_days: next.intervalDays,
      reps: next.reps,
    },
    { onConflict: "user_id,concept_id" },
  );

  return { userId, conceptId, ...next };
}
