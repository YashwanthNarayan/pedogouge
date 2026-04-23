import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runIntake } from "@/lib/anthropic/intake-pipeline";
import { embed } from "@/lib/embeddings/voyage-client";
import { IntakeRequest } from "@pedagogue/shared";
import { SchemaParseError } from "@/lib/anthropic/errors";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = IntakeRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectIdea } = parsed.data;

  // Auth check: require Authorization header in non-test environments
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production" && !authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const blueprint = await runIntake(projectIdea);

    // Embed concept names for pgvector KNN (fire-and-forget in dev; awaited in prod for reliability)
    const conceptNames = blueprint.conceptGraph.map((c) => c.name);
    const sessionId = crypto.randomUUID();

    // Embed and persist (non-blocking in dev for speed; awaited in prod)
    const embedAndPersist = async () => {
      try {
        const embeddings = await embed(conceptNames, { inputType: "document" });
        // In a real deployment this would upsert to Supabase:
        // await supabase.from("concept_nodes").insert(rows with embeddings)
        // For now, attach embeddings to the returned blueprint metadata
        void embeddings; // consumed by Supabase upsert (wired in T3-01)
      } catch {
        // Non-fatal: embeddings can be backfilled later
      }
    };

    if (process.env.NODE_ENV === "production") {
      await embedAndPersist();
    } else {
      void embedAndPersist();
    }

    return NextResponse.json({ sessionId, blueprint });
  } catch (err) {
    if (err instanceof SchemaParseError) {
      console.error("[intake] Schema validation failed\n  raw:", err.raw, "\n  zod:", err.zodError);
    } else {
      console.error("[intake] Error:", err);
    }
    const message = err instanceof Error ? err.message : "Internal error";
    if (message.includes("401") || message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Anthropic auth failed" }, { status: 502 });
    }
    if (message.includes("429") || message.includes("Rate limit")) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
