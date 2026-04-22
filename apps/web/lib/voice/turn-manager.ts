// ---------------------------------------------------------------------------
// TurnManager — orchestrates Deepgram ASR → Claude → ElevenLabs per turn
//
// T2-09: Deepgram wiring
// T2-10: Claude streaming + tool calls (stubs wired here)
// T2-11: ElevenLabs TTS + sentence buffer + barge-in
// ---------------------------------------------------------------------------

import { openDeepgramStream, type DeepgramStream, type DeepgramTranscriptEvent } from "./deepgram-client";
import { openElevenLabsStream, type ElevenLabsStream } from "./elevenlabs-client";
import { SentenceBuffer } from "./sentence-buffer";

export interface TurnManagerOptions {
  sessionId: string;
  voiceId?: string;                                   // ElevenLabs voice ID; required for TTS
  onClaudeTextDelta: (text: string) => void;
  onClaudeToolCall: (name: string, result: unknown) => void;
  onTTSChunk: (audio: Uint8Array) => void;
  onTranscriptReady: (text: string) => void;
  onClose: () => void;
  onError: (err: Error) => void;
}

export class TurnManager {
  private opts: TurnManagerOptions;
  private dgStream: DeepgramStream | null = null;
  private elStream: ElevenLabsStream | null = null;
  private sentenceBuffer = new SentenceBuffer();
  private transcriptBuffer = "";
  private claudeAbort: AbortController | null = null;
  private closed = false;

  constructor(opts: TurnManagerOptions) {
    this.opts = opts;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async open(): Promise<void> {
    this.dgStream = await openDeepgramStream({
      sampleRate: 16_000,
      language: "en-US",
      endpointingMs: 1_000,
      onTranscript: (event: DeepgramTranscriptEvent) => this.handleTranscript(event),
      onError: (err: Error) => this.opts.onError(err),
      onClose: () => {
        if (!this.closed) this.opts.onClose();
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Audio I/O
  // ---------------------------------------------------------------------------

  async pushAudio(chunk: Buffer): Promise<void> {
    if (!this.dgStream) {
      throw new Error("TurnManager: call open() before pushAudio()");
    }
    this.dgStream.send(chunk);
  }

  // ---------------------------------------------------------------------------
  // Barge-in — VAD detected speech while TTS was playing
  // ---------------------------------------------------------------------------

  async cancel(): Promise<void> {
    // 1. Abort any in-flight Claude stream
    this.claudeAbort?.abort();
    this.claudeAbort = null;

    // 2. Close the ElevenLabs stream — stops further audio chunks to browser
    if (this.elStream) {
      this.elStream.close();
      this.elStream = null;
    }

    // 3. Reset buffers so next utterance starts clean
    this.transcriptBuffer = "";
    this.sentenceBuffer.flush();
  }

  close(): void {
    this.closed = true;
    this.dgStream?.close();
    this.dgStream = null;
    this.elStream?.close();
    this.elStream = null;
  }

  // ---------------------------------------------------------------------------
  // Claude streaming + ElevenLabs TTS pipeline
  //
  // Called when Deepgram fires utterance_end with finalized transcript.
  // In the full defense-ws orchestrator (T3-14) this is invoked directly.
  // Exposed here for testing and for the defense-ws server to call.
  // ---------------------------------------------------------------------------

  async runClaudeTurn(userText: string, runDefenseTurn: (text: string, abort: AbortSignal) => AsyncGenerator<unknown>): Promise<void> {
    this.claudeAbort = new AbortController();
    const { signal } = this.claudeAbort;

    // Open ElevenLabs stream if voiceId configured
    if (this.opts.voiceId) {
      this.elStream = await openElevenLabsStream({
        voiceId: this.opts.voiceId,
        onChunk: (audio: Uint8Array) => {
          if (!signal.aborted) this.opts.onTTSChunk(audio);
        },
        onError: (err: Error) => {
          if (!signal.aborted) this.opts.onError(err);
        },
        onClose: () => {
          // Normal ElevenLabs stream end — nothing to do
        },
      });
    }

    this.sentenceBuffer = new SentenceBuffer();

    try {
      for await (const event of runDefenseTurn(userText, signal)) {
        if (signal.aborted) break;

        const e = event as Record<string, unknown>;

        if (e.kind === "text_delta") {
          const text = e.text as string;
          this.opts.onClaudeTextDelta(text);

          // Push into sentence buffer and send complete sentences to ElevenLabs
          if (this.elStream) {
            const sentences = this.sentenceBuffer.push(text);
            for (const sentence of sentences) {
              if (!signal.aborted) this.elStream.writeText(sentence, false);
            }
          }
        } else if (e.kind === "tool_result") {
          this.opts.onClaudeToolCall(e.toolName as string, e.result);
        } else if (e.kind === "done") {
          // Flush any remaining sentence fragment to ElevenLabs
          if (this.elStream && !signal.aborted) {
            const remaining = this.sentenceBuffer.flush();
            this.elStream.writeText(remaining, true);
          }
        }
      }
    } finally {
      if (this.claudeAbort && !signal.aborted) {
        this.claudeAbort = null;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Deepgram event handler
  // ---------------------------------------------------------------------------

  private handleTranscript(event: DeepgramTranscriptEvent): void {
    if (event.utteranceEnd) {
      const finalText = this.transcriptBuffer.trim();
      this.transcriptBuffer = "";
      if (finalText) {
        this.opts.onTranscriptReady(finalText);
      }
      return;
    }

    if (event.isFinal) {
      this.transcriptBuffer += (this.transcriptBuffer ? " " : "") + event.text;
    }
  }
}
