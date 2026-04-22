"use client";

// ---------------------------------------------------------------------------
// Audio output: MediaSource + SourceBuffer for streaming TTS from ElevenLabs
// Barge-in: call stop() to flush and silence output mid-stream.
// ---------------------------------------------------------------------------

export interface AudioOutOptions {
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onError?: (err: Error) => void;
}

export class AudioOut {
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private audio: HTMLAudioElement | null = null;
  private queue: ArrayBuffer[] = [];
  private appending = false;
  private opts: AudioOutOptions;
  private objectUrl: string | null = null;

  constructor(opts: AudioOutOptions = {}) {
    this.opts = opts;
  }

  /** Initialize — must be called once, in response to a user gesture */
  init(): void {
    this.audio = document.createElement("audio");
    this.audio.autoplay = true;

    this.mediaSource = new MediaSource();
    this.objectUrl = URL.createObjectURL(this.mediaSource);
    this.audio.src = this.objectUrl;

    this.mediaSource.addEventListener("sourceopen", () => {
      if (!this.mediaSource) return;
      // ElevenLabs Flash v2.5 outputs mp3 or opus-in-webm
      const mimeType = MediaSource.isTypeSupported("audio/mpeg")
        ? "audio/mpeg"
        : "audio/webm; codecs=opus";

      try {
        this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeType);
        this.sourceBuffer.addEventListener("updateend", () => {
          this.appending = false;
          this.flushQueue();
        });
      } catch (err) {
        this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    });

    this.audio.addEventListener("playing", () => this.opts.onPlaybackStart?.());
    this.audio.addEventListener("ended", () => this.opts.onPlaybackEnd?.());
  }

  /** Append a base64-encoded audio chunk from the server */
  appendChunk(base64: string): void {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    this.queue.push(bytes.buffer);
    this.flushQueue();
  }

  /** Signal start of new TTS stream — clears old buffer */
  onTTSStart(): void {
    this.queue = [];
    if (this.sourceBuffer && !this.sourceBuffer.updating && this.mediaSource?.readyState === "open") {
      try {
        this.sourceBuffer.remove(0, Infinity);
      } catch {
        // ignore if nothing buffered
      }
    }
  }

  /** Barge-in: immediately stop all output */
  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.queue = [];
    this.appending = false;
  }

  /** Tear down completely */
  destroy(): void {
    this.stop();
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    if (this.audio) {
      this.audio.src = "";
      this.audio = null;
    }
    this.mediaSource = null;
    this.sourceBuffer = null;
  }

  private flushQueue(): void {
    if (this.appending || this.queue.length === 0) return;
    if (!this.sourceBuffer || this.sourceBuffer.updating) return;
    if (this.mediaSource?.readyState !== "open") return;

    this.appending = true;
    const chunk = this.queue.shift()!;
    try {
      this.sourceBuffer.appendBuffer(chunk);
    } catch (err) {
      this.appending = false;
      this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
