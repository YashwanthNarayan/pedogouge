import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { selectIntervention, generateTierContent } from "@/lib/anthropic/intervention";
import { RateLimitError, APIError } from "@/lib/anthropic/errors";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const BodySchema = z.object({
  sessionId: z.string().uuid("sessionId must be a UUID"),
  conceptId: z.string().min(1),
  strugglePattern: z.enum(["none", "conceptual_gap", "integration", "surface_fix"]),
  preferredChannel: z
    .enum(["chat", "inline", "codelens", "notebook", "debug", "terminal"])
    .optional(),
});

// ---------------------------------------------------------------------------
// POST /api/intervene
//
// Meta-agent selects the appropriate intervention tier and delivery channel,
// generates content for that tier, persists to interventions table, and
// pushes via Realtime to the extension.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // Auth check in production
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && !authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { sessionId, conceptId, strugglePattern, preferredChannel } = parsed.data;

  try {
    // Step 1: Meta-agent selects tier + delivery channel
    const decision = await selectIntervention({
      sessionId,
      conceptId,
      strugglePattern,
      preferredChannel,
    });

    // Step 2: Generate content for the selected tier
    const content = await generateTierContent(decision, sessionId);

    // TODO (P3 T3-01): persist to interventions table
    // await supabase.from("interventions").insert({
    //   session_id: sessionId,
    //   concept_id: conceptId,
    //   tier: decision.tier,
    //   content_md: content.content_md,
    //   outcome: null,
    //   ts: new Date().toISOString(),
    // });

    // TODO (P3 T3-01): push via Realtime channel `interventions:${sessionId}`
    // await supabase.channel(`interventions:${sessionId}`).send({
    //   type: "broadcast",
    //   event: "intervention",
    //   payload: { decision, content },
    // });

    return NextResponse.json({
      decision,
      content,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: err.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } },
      );
    }
    if (err instanceof APIError) {
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }
    console.error("[/api/intervene] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
