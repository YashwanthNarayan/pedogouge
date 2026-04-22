// Supabase Edge Function: audio-purge
// Deletes voice-defense audio files older than 30 days (privacy).
// Triggered daily at 03:00 UTC via pg_cron.
//
// To register the schedule, run this SQL once after deploying:
//   SELECT cron.schedule(
//     'audio-purge',
//     '0 3 * * *',
//     $$SELECT net.http_post(
//       url := current_setting('app.supabase_functions_endpoint') || '/audio-purge',
//       headers := jsonb_build_object(
//         'Content-Type', 'application/json',
//         'Authorization', 'Bearer ' || current_setting('app.service_role_key')
//       ),
//       body := '{}'::jsonb
//     )$$
//   );

import { createClient } from "@supabase/supabase-js";

const BUCKET = "audio";
const BATCH_SIZE = 100;
const STORAGE_BASE_PREFIX = "/storage/v1/object/public/audio/";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function extractStoragePath(audioUrl: string): string | null {
  try {
    const url = new URL(audioUrl);
    const idx = url.pathname.indexOf(STORAGE_BASE_PREFIX);
    if (idx === -1) return null;
    return url.pathname.slice(idx + STORAGE_BASE_PREFIX.length);
  } catch {
    return null;
  }
}

Deno.serve(async (_req: Request): Promise<Response> => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Step 1: Find defense turns with audio older than 30 days
    const { data: turns, error: fetchErr } = await supabase
      .from("defense_turns")
      .select("id, audio_url")
      .lt("ts", cutoff)
      .not("audio_url", "is", null);

    if (fetchErr) {
      console.error("[audio-purge] Failed to fetch turns:", fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
    }

    if (!turns || turns.length === 0) {
      console.log("[audio-purge] No audio files to purge.");
      return new Response(JSON.stringify({ purged: 0 }), { status: 200 });
    }

    let totalPurged = 0;

    // Step 2: Process in batches of 100
    for (let i = 0; i < turns.length; i += BATCH_SIZE) {
      const batch = turns.slice(i, i + BATCH_SIZE);

      const paths: string[] = [];
      const ids: string[] = [];

      for (const turn of batch) {
        const path = extractStoragePath(turn.audio_url as string);
        if (path) {
          paths.push(path);
          ids.push(turn.id as string);
        }
      }

      if (paths.length === 0) continue;

      // Step 3: Delete from Supabase Storage
      const { error: removeErr } = await supabase.storage
        .from(BUCKET)
        .remove(paths);

      if (removeErr) {
        console.error(`[audio-purge] Storage remove error (batch ${i}):`, removeErr.message);
        // Continue — partial failure is acceptable
      }

      // Step 4: Null out audio_url in DB so we don't try to delete again
      const { error: updateErr } = await supabase
        .from("defense_turns")
        .update({ audio_url: null })
        .in("id", ids);

      if (updateErr) {
        console.error(`[audio-purge] DB update error (batch ${i}):`, updateErr.message);
      } else {
        totalPurged += paths.length;
      }
    }

    // Step 5: Log summary
    console.log(`[audio-purge] Purged ${totalPurged} audio files.`);

    return new Response(JSON.stringify({ purged: totalPurged }), { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[audio-purge] Unexpected error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
