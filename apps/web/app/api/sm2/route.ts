import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { upsertSchedule, type SM2Grade } from "@/lib/sm2";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  return user?.id ?? null;
}

// ---------------------------------------------------------------------------
// GET /api/sm2?userId=  — returns due items for the authenticated user
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("sm2_schedule")
    .select(
      "concept_id, next_due_at, ease, reps, interval_days, concept_nodes!inner(name, mastery_score)",
    )
    .eq("user_id", userId)
    .lte("next_due_at", now);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (data ?? []).map((row) => {
    const node = Array.isArray(row.concept_nodes)
      ? row.concept_nodes[0]
      : row.concept_nodes;
    return {
      conceptId: row.concept_id as string,
      name: (node as { name: string } | null)?.name ?? "",
      mastery: (node as { mastery_score: number } | null)?.mastery_score ?? 0,
      nextDueAt: row.next_due_at as string,
      ease: Number(row.ease),
      reps: Number(row.reps),
    };
  });

  return NextResponse.json({ due });
}

// ---------------------------------------------------------------------------
// POST /api/sm2  — submit a grade and update the schedule
// ---------------------------------------------------------------------------

const PostBody = z.object({
  conceptId: z.string(),
  grade: z.union([
    z.literal(0), z.literal(1), z.literal(2),
    z.literal(3), z.literal(4), z.literal(5),
  ]),
});

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PostBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { conceptId, grade } = parsed.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getServiceClient() as any;

  const updated = await upsertSchedule(userId, conceptId, grade as SM2Grade, supabase);

  return NextResponse.json({
    userId: updated.userId,
    conceptId: updated.conceptId,
    nextDueAt: updated.nextDueAt.toISOString(),
    ease: updated.ease,
    intervalDays: updated.intervalDays,
    reps: updated.reps,
  });
}
