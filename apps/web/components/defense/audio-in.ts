"use client";

// ---------------------------------------------------------------------------
// Audio input: MediaRecorder + simple energy-based VAD
// Emits 100ms audio chunks + VAD start/end events.
// ---------------------------------------------------------------------------

export interface AudioInOptions {
  onChunk: (base64: string) => void;
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
  onError: (err: Error) => void;
}

// Energy threshold for VAD (RMS over the last chunk; tune empirically)
const VAD_RMS_THRESHOLD = 0.015;
const VAD_HOLD_FRAMES = 8; // frames below threshold before emitting speech_end

export class AudioIn {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private speaking = false;
  private silentFrames = 0;
  private vadTimer: ReturnType<typeof setInterval> | null = null;
  private opts: AudioInOptions;

  constructor(opts: AudioInOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16_000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Set up analyser for VAD
      this.audioContext = new AudioContext({ sampleRate: 16_000 });
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      source.connect(this.analyser);

      // VAD polling every 100ms (matches recorder timeslice)
      const dataArray = new Float32Array(this.analyser.fftSize);
      this.vadTimer = setInterval(() => {
        if (!this.analyser) return;
        this.analyser.getFloatTimeDomainData(dataArray);
        const rms = Math.sqrt(dataArray.reduce((s, v) => s + v * v, 0) / dataArray.length);

        if (rms > VAD_RMS_THRESHOLD) {
          this.silentFrames = 0;
          if (!this.speaking) {
            this.speaking = true;
            this.opts.onSpeechStart();
          }
        } else {
          this.silentFrames++;
          if (this.speaking && this.silentFrames >= VAD_HOLD_FRAMES) {
            this.speaking = false;
            this.opts.onSpeechEnd();
          }
        }
      }, 100);

      // MediaRecorder for audio capture
      const mimeType = MediaRecorder.isTypeSupported("audio/webm; codecs=opus")
        ? "audio/webm; codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg; codecs=opus")
          ? "audio/ogg; codecs=opus"
          : "audio/webm";

      this.recorder = new MediaRecorder(this.stream, { mimeType });
      this.recorder.ondataavailable = async (event) => {
        if (event.data.size === 0) return;
        const buffer = await event.data.arrayBuffer();
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(buffer))
        );
        this.opts.onChunk(base64);
      };

      this.recorder.onerror = (event) => {
        this.opts.onError(new Error(`MediaRecorder error: ${JSON.stringify(event)}`));
      };

      this.recorder.start(100); // 100ms timeslice
    } catch (err) {
      this.opts.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  stop(): void {
    if (this.vadTimer) {
      clearInterval(this.vadTimer);
      this.vadTimer = null;
    }
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
    this.analyser?.disconnect();
    this.audioContext?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.recorder = null;
    this.stream = null;
    this.analyser = null;
    this.audioContext = null;
    this.speaking = false;
  }

  /** Mute/unmute: stops sending chunks + suppresses VAD events while muted */
  setMuted(muted: boolean): void {
    if (muted) {
      // Pause recorder so no chunks are sent
      if (this.recorder && this.recorder.state === "recording") {
        this.recorder.pause();
      }
      // If currently flagged as speaking, emit end
      if (this.speaking) {
        this.speaking = false;
        this.opts.onSpeechEnd();
      }
    } else {
      // Resume recorder
      if (this.recorder && this.recorder.state === "paused") {
        this.recorder.resume();
      }
    }
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }
}
