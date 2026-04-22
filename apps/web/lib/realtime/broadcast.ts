import type { SupabaseClient } from "@supabase/supabase-js";
import { Channels } from "@pedagogue/shared";

/**
 * Broadcast an event payload to the session's events channel.
 * Fire-and-forget: resolves immediately, errors are swallowed after logging.
 */
export async function broadcastToSession(
  sessionId: string,
  event: string,
  payload: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<void> {
  supabase
    .channel(Channels.events(sessionId))
    .send({ type: "broadcast", event, payload })
    .catch((err: unknown) => console.error("[broadcast] events channel error:", err))
    .finally(() => supabase.removeAllChannels());
}

/**
 * Broadcast a teacher nudge to the session's nudge channel.
 */
export async function broadcastNudge(
  sessionId: string,
  nudge: { kind: string; payload?: unknown; fromUserId: string },
  supabase: SupabaseClient,
): Promise<void> {
  supabase
    .channel(Channels.nudges(sessionId))
    .send({ type: "broadcast", event: "nudge", payload: nudge })
    .catch((err: unknown) => console.error("[broadcast] nudge channel error:", err))
    .finally(() => supabase.removeAllChannels());
}
