"use client";

// ---------------------------------------------------------------------------
// Defense WebSocket connection manager
// Connects to defense-ws (Fly.io) for the voice defense pipeline.
// ---------------------------------------------------------------------------

export type DefenseMessageKind =
  | "audio"
  | "vad_speech_start"
  | "vad_speech_end"
  | "end";

export type ServerMessageKind =
  | "tts_audio"
  | "tts_start"
  | "tts_stop"
  | "transcript_user"
  | "transcript_claude"
  | "phase_advance"
  | "edit_applied"
  | "error"
  | "ping";

export interface ServerMessage {
  kind: ServerMessageKind;
  data?: string;        // base64 audio for tts_audio; text for transcripts
  phase?: string;
  error?: string;
}

export interface DefenseConnectionOptions {
  wsUrl: string;
  roomToken: string;
  onMessage: (msg: ServerMessage) => void;
  onOpen: () => void;
  onClose: (code: number, reason: string) => void;
  onError: (err: Event) => void;
}

export class DefenseConnection {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private opts: DefenseConnectionOptions;
  private closed = false;

  constructor(opts: DefenseConnectionOptions) {
    this.opts = opts;
  }

  connect(): void {
    if (this.closed) return;
    const url = `${this.opts.wsUrl}?token=${encodeURIComponent(this.opts.roomToken)}`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.opts.onOpen();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data as string);
        this.opts.onMessage(msg);
      } catch {
        // binary frames are TTS audio — handled via tts_audio kind messages separately
      }
    };

    this.ws.onclose = (event) => {
      this.stopHeartbeat();
      this.opts.onClose(event.code, event.reason);
      if (!this.closed && this.reconnectAttempts < 3) {
        const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 10_000);
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), delay);
      }
    };

    this.ws.onerror = (event) => {
      this.opts.onError(event);
    };
  }

  send(kind: DefenseMessageKind, payload?: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ kind, ...payload }));
  }

  sendAudio(base64Chunk: string): void {
    this.send("audio", { data: base64Chunk, ts: Date.now() });
  }

  close(): void {
    this.closed = true;
    this.stopHeartbeat();
    this.ws?.close(1000, "defense ended");
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ kind: "ping" }));
      }
    }, 20_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
