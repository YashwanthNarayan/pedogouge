import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export interface MatchedChunk {
  id: string;
  concept_id: string;
  body_md: string;
  source_url: string | null;
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  similarity: number;
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: object }>) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — cookie mutation is a no-op
          }
        },
      },
    },
  );
}

export async function matchChunks(
  queryEmbedding: number[],
  opts: { k?: number; conceptFilter?: string; difficultyFilter?: string } = {},
): Promise<MatchedChunk[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("match_chunks", {
    query_vec: queryEmbedding,
    k: opts.k ?? 5,
    concept_filter: opts.conceptFilter ?? null,
    difficulty_filter: opts.difficultyFilter ?? null,
  });
  if (error) throw new Error(`match_chunks RPC failed: ${error.message}`);
  return (data as MatchedChunk[]) ?? [];
}
