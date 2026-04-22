import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { generateSessionMemory } from "@/lib/anthropic/memory";

const BodySchema = z.object({
  sessionId: z.string().uuid(),
});

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
// POST /api/memory/write
// Body: { sessionId: string }
// Generates a Haiku summary of the session and stores it in user_memories.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(userId, "ai");
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { sessionId } = parsed.data;
  const supabase = getServiceClient();

  // Verify the user owns the session
  const { data: session } = await supabase
    .from("sessions")
    .select("user_id")
    .eq("id", sessionId)
    .single();

  if (!session || session.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await generateSessionMemory(sessionId, userId, supabase as any);
    return NextResponse.json({ memoryId: result.memoryId, wordCount: result.wordCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Memory generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
