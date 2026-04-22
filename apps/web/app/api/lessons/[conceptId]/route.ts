import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateLesson } from "@/lib/anthropic/curriculum";
import { RateLimitError, APIError } from "@/lib/anthropic/errors";

const QuerySchema = z.object({
  sessionId: z.string().uuid("sessionId must be a UUID"),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conceptId: string }> },
) {
  const { conceptId } = await params;

  if (!conceptId || conceptId.trim() === "") {
    return NextResponse.json({ error: "conceptId is required" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const queryParsed = QuerySchema.safeParse({
    sessionId: searchParams.get("sessionId"),
  });

  if (!queryParsed.success) {
    return NextResponse.json(
      { error: queryParsed.error.flatten() },
      { status: 400 },
    );
  }

  const { sessionId } = queryParsed.data;

  // Auth check in production
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && !authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const lesson = await generateLesson(sessionId, conceptId);
    return NextResponse.json(lesson);
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
    console.error("[/api/lessons] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
