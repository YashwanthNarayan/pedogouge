// ---------------------------------------------------------------------------
// Connection handler — one instance per WebSocket client
// ---------------------------------------------------------------------------

import type { IncomingMessage } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { createClient as createDeepgram, LiveTranscriptionEvents } from "@deepgram/sdk";
import Anthropic from "@anthropic-ai/sdk";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { WebSocket } from "ws";
import { TurnManager } from "./turn-manager.js";

interface ClientMessage {
  type: "audio_chunk" | "end_utterance" | "phase_advance";
  data?: string;  // base64 PCM16 for audio_chunk
  phase?: number;
}

function send(ws: WebSocket, msg: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function close(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch { /* already closed */ }
}

export async function handleConnection(
  ws: WebSocket,
  req: IncomingMessage,
): Promise<void> {
  // ── 1. Parse connection params ───────────────────────────────────────────

  const rawUrl = req.url ?? "/";
  const url = new URL(rawUrl, "http://localhost");
  const token = url.searchParams.get("token");
  const sessionId = url.searchParams.get("sessionId");

  if (!token || !sessionId) {
    close(ws, 1008, "Missing token or sessionId");
    return;
  }

  // ── 2. Verify Supabase JWT via JWKS (supports both HMAC legacy and ECC) ──

  const supabaseUrlForJwks = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrlForJwks) {
    console.error("[server] SUPABASE_URL not set");
    close(ws, 1011, "Server misconfigured");
    return;
  }

  let userId: string;
  try {
    const JWKS = createRemoteJWKSet(
      new URL(`${supabaseUrlForJwks}/auth/v1/.well-known/jwks.json`),
    );
    const { payload } = await jwtVerify(token, JWKS);
    const sub = payload.sub ?? (payload as Record<string, string>)["user_id"];
    if (!sub) throw new Error("No subject in JWT");
    userId = sub;
  } catch (err) {
    console.warn("[server] JWT verification failed:", err);
    close(ws, 1008, "Invalid or expired token");
    return;
  }

  // ── 3. Fetch session + defense seeds ────────────────────────────────────

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[server] Supabase env vars not set");
    close(ws, 1011, "Server misconfigured");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: session } = await supabase
    .from("sessions")
    .select("id, user_id, project_blueprint_json")
    .eq("id", sessionId)
    .single();

  if (!session || session.user_id !== userId) {
    close(ws, 1008, "Session not found or access denied");
    return;
  }

  // Try to load existing seeds; call seed API if not yet seeded
  let seeds: Record<string, unknown> | null = null;
  const { data: defenseSess } = await supabase
    .from("defense_sessions")
    .select("overall_rubric_json")
    .eq("session_id", sessionId)
    .maybeSingle();

  const existingSeeds = (defenseSess?.overall_rubric_json as Record<string, unknown> | null)?.seeds;
  if (existingSeeds) {
    seeds = existingSeeds as Record<string, unknown>;
  } else {
    const webAppUrl = process.env.WEB_APP_URL ?? "http://localhost:3000";
    try {
      const resp = await fetch(`${webAppUrl}/api/defense/seed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-service-secret": supabaseKey,
        },
        body: JSON.stringify({ sessionId }),
      });
      if (resp.ok) {
        seeds = await resp.json() as Record<string, unknown>;
        console.info(`[server] Seeded defense for session ${sessionId}`);
      }
    } catch (err) {
      console.warn("[server] Could not fetch defense seeds:", err);
    }
  }

  // ── 4. Open Deepgram live transcription ─────────────────────────────────

  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramKey) {
    close(ws, 1011, "Deepgram API key not configured");
    return;
  }

  const deepgramClient = createDeepgram(deepgramKey);
  const dgConnection = deepgramClient.listen.live({
    model: "nova-2",
    language: "en",
    interim_results: true,
    utterance_end_ms: 1000,
    smart_format: true,
  });

  // ── 5. Create TurnManager ────────────────────────────────────────────────

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY ?? "";
  const webAppBaseUrl = process.env.WEB_APP_URL ?? "http://localhost:3000";

  const turnManager = new TurnManager(
    ws,
    anthropic,
    elevenLabsApiKey,
    seeds,
    sessionId,
    webAppBaseUrl,
  );

  // ── 6. Wire Deepgram events ──────────────────────────────────────────────

  dgConnection.on(LiveTranscriptionEvents.Open, () => {
    console.info(`[server] Deepgram open for session ${sessionId}`);
  });

  dgConnection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const alt = data?.channel?.alternatives?.[0];
    if (!alt) return;
    const text: string = alt.transcript ?? "";
    const isFinal: boolean = data.is_final ?? false;

    if (text) {
      turnManager.handleTranscript(text, isFinal);
      send(ws, { type: "transcript", text, isFinal });
    }

    if (data.speech_final) {
      turnManager.handleUtteranceEnd().catch((err) => {
        console.error("[server] handleUtteranceEnd error:", err);
      });
    }
  });

  dgConnection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
    turnManager.handleUtteranceEnd().catch((err) => {
      console.error("[server] handleUtteranceEnd (UtteranceEnd) error:", err);
    });
  });

  dgConnection.on(LiveTranscriptionEvents.Error, (err) => {
    console.error("[server] Deepgram error:", err);
    send(ws, { type: "error", message: "Transcription error" });
  });

  dgConnection.on(LiveTranscriptionEvents.Close, () => {
    console.info(`[server] Deepgram closed for session ${sessionId}`);
  });

  // ── 7. Handle incoming client messages ──────────────────────────────────

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ClientMessage;

      if (msg.type === "audio_chunk" && msg.data) {
        const buf = Buffer.from(msg.data, "base64");
        // @ts-expect-error Deepgram live connection send accepts Buffer
        dgConnection.send(buf);
      } else if (msg.type === "end_utterance") {
        turnManager.handleUtteranceEnd().catch((err) => {
          console.error("[server] handleUtteranceEnd error:", err);
        });
      } else if (msg.type === "phase_advance") {
        turnManager.advancePhase();
      }
    } catch (err) {
      console.warn("[server] Failed to parse client message:", err);
    }
  });

  // ── 8. Cleanup on close ──────────────────────────────────────────────────

  ws.on("close", (code, reason) => {
    console.info(
      `[server] Client disconnected: session=${sessionId} code=${code} reason=${reason.toString()}`,
    );
    try {
      dgConnection.finish?.();
    } catch { /* ignore */ }
    turnManager.destroy();
  });

  // Signal client the connection is ready
  send(ws, { type: "ready", sessionId, phase: "blueprint_interrogation" });
  console.info(`[server] Session ${sessionId} ready for user ${userId}`);
}
