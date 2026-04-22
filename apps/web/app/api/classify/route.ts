import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { classifyStderr } from "@/lib/anthropic/telemetry";
import { detectStrugglePattern } from "@/lib/graph/struggle-patterns";
import { RateLimitError, APIError } from "@/lib/anthropic/errors";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const BodySchema = z.object({
  sessionId: z.string().uuid("sessionId must be a UUID"),
  conceptId: z.string().optional(),
  language: z.enum(["python", "javascript", "typescript", "java", "cpp"]),
  stderr_line: z.string().min(1).max(2048),
  context_lines: z.array(z.string()).max(10).optional(),
});

// ---------------------------------------------------------------------------
// POST /api/classify
//
// Called by the extension's stderr narrator on every error line.
// Returns concept tags + a suggestion + the current struggle pattern.
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

  const { sessionId, conceptId, language, stderr_line, context_lines } = parsed.data;

  try {
    // Classify stderr → concept tags
    const classifyResult = await classifyStderr({
      sessionId,
      language,
      stderr_line,
      context_lines,
    });

    // If a conceptId was provided (e.g., from tree-sitter), also detect struggle pattern
    let strugglePattern: string | undefined;
    if (conceptId) {
      strugglePattern = await detectStrugglePattern(sessionId, conceptId);
    }

    // TODO (P3 T3-01): persist to events table
    // await supabase.from("events").insert({ session_id: sessionId, kind: "stderr_classified", payload_json: classifyResult });

    return NextResponse.json({
      ...classifyResult,
      ...(strugglePattern !== undefined ? { strugglePattern } : {}),
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
    console.error("[/api/classify] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
