// Defense WebSocket Turn Manager
// Full implementation: T3-14
// Orchestrates: Deepgram ASR → Claude Sonnet fine-grain tool streaming → ElevenLabs TTS
// Handles: barge-in, inject_bug, score_counterfactual, end_phase tool execution

import { WebSocketServer } from "ws";

const PORT = process.env.PORT ?? 3001;
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (conn, req) => {
  console.log("[defense-ws] new connection (T3-14 stub — full impl in T3-14)");
  conn.send(JSON.stringify({ kind: "connected", message: "Defense WS (T3-14 stub)" }));

  conn.on("message", (data) => {
    // T3-14: parse message kind (audio, vad_speech_start, vad_speech_end, end)
    // and route through Deepgram → Claude → ElevenLabs pipeline
    console.log("[defense-ws] message received (stub)");
  });

  conn.on("close", () => {
    console.log("[defense-ws] connection closed");
  });
});

console.log(`[defense-ws] listening on :${PORT}`);
