import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";

// ---------------------------------------------------------------------------
// Mock the 'ws' module — reuse the same pattern as deepgram.test.ts
// ---------------------------------------------------------------------------
let fakeWs: ReturnType<typeof makeFakeWs>;

function makeFakeWs() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const sent: string[] = [];
  let readyState = WebSocket.CONNECTING as number;

  return {
    get readyState() { return readyState; },
    set readyState(v: number) { readyState = v; },
    sent,
    on(event: string, cb: (...args: unknown[]) => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    },
    send(data: string) {
      sent.push(data);
    },
    close() {
      readyState = WebSocket.CLOSED;
      (listeners["close"] ?? []).forEach((cb) => cb());
    },
    emit(event: string, ...args: unknown[]) {
      (listeners[event] ?? []).forEach((cb) => cb(...args));
    },
    OPEN: WebSocket.OPEN,
  };
}

vi.mock("ws", () => {
  const WS = vi.fn().mockImplementation(() => {
    fakeWs = makeFakeWs();
    return fakeWs;
  });
  (WS as unknown as Record<string, number>).OPEN = 1;
  (WS as unknown as Record<string, number>).CONNECTING = 0;
  (WS as unknown as Record<string, number>).CLOSING = 2;
  (WS as unknown as Record<string, number>).CLOSED = 3;
  return { default: WS };
});

import { openElevenLabsStream } from "../elevenlabs-client";
import { SentenceBuffer } from "../sentence-buffer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAudioMessage(base64Audio: string): Buffer {
  return Buffer.from(JSON.stringify({ audio: base64Audio }));
}

function makeErrorMessage(msg: string): Buffer {
  return Buffer.from(JSON.stringify({ error: msg }));
}

// ---------------------------------------------------------------------------
// SentenceBuffer tests
// ---------------------------------------------------------------------------

describe("SentenceBuffer", () => {
  it("returns empty array when no sentence boundary yet", () => {
    const buf = new SentenceBuffer();
    expect(buf.push("Hello there")).toEqual([]);
  });

  it("emits a sentence on period + space", () => {
    const buf = new SentenceBuffer();
    const out = buf.push("Hello there. ");
    expect(out).toHaveLength(1);
    expect(out[0]).toBe("Hello there.");
  });

  it("emits on exclamation and question marks", () => {
    const buf = new SentenceBuffer();
    const a = buf.push("Good job! ");
    expect(a[0]).toBe("Good job!");
    const b = buf.push("Really? ");
    expect(b[0]).toBe("Really?");
  });

  it("accumulates across multiple pushes before boundary", () => {
    const buf = new SentenceBuffer();
    buf.push("Walk me ");
    buf.push("through your ");
    const out = buf.push("code. ");
    expect(out).toHaveLength(1);
    expect(out[0]).toBe("Walk me through your code.");
  });

  it("emits multiple sentences in one push", () => {
    const buf = new SentenceBuffer();
    const out = buf.push("Hello. How are you? ");
    expect(out).toHaveLength(2);
    expect(out[0]).toBe("Hello.");
    expect(out[1]).toBe("How are you?");
  });

  it("flush returns remaining partial text and clears buffer", () => {
    const buf = new SentenceBuffer();
    buf.push("Incomplete fragment");
    const rest = buf.flush();
    expect(rest).toBe("Incomplete fragment");
    expect(buf.pending).toBe("");
  });

  it("flush returns empty string when buffer is empty", () => {
    const buf = new SentenceBuffer();
    expect(buf.flush()).toBe("");
  });

  it("handles quoted sentence endings", () => {
    const buf = new SentenceBuffer();
    const out = buf.push('He said "hello." ');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("hello");
  });
});

// ---------------------------------------------------------------------------
// ElevenLabs client tests
// ---------------------------------------------------------------------------

describe("openElevenLabsStream", () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test-el-key";
  });

  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
    vi.clearAllMocks();
  });

  it("throws when ELEVENLABS_API_KEY is not set", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    await expect(
      openElevenLabsStream({
        voiceId: "voice-123",
        onChunk: vi.fn(),
        onError: vi.fn(),
        onClose: vi.fn(),
      })
    ).rejects.toThrow("ELEVENLABS_API_KEY");
  });

  it("connects to the ElevenLabs WSS endpoint with correct voice + model", async () => {
    const streamPromise = openElevenLabsStream({
      voiceId: "voice-abc",
      onChunk: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;

    const WS = (await import("ws")).default;
    const url = vi.mocked(WS).mock.calls[0][0] as string;
    expect(url).toMatch(/^wss:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/voice-abc\/stream-input/);
    expect(url).toContain("eleven_flash_v2_5");
  });

  it("sends initial config with API key and voice settings on open", async () => {
    const streamPromise = openElevenLabsStream({
      voiceId: "voice-abc",
      onChunk: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;

    expect(fakeWs.sent).toHaveLength(1);
    const init = JSON.parse(fakeWs.sent[0]);
    expect(init.xi_api_key).toBe("test-el-key");
    expect(init.voice_settings).toBeDefined();
  });

  it("writeText sends non-final chunk with try_trigger_generation=true", async () => {
    const streamPromise = openElevenLabsStream({
      voiceId: "voice-abc",
      onChunk: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    const stream = await streamPromise;

    fakeWs.sent.length = 0; // clear init message
    stream.writeText("Hello there.", false);

    expect(fakeWs.sent).toHaveLength(1);
    const msg = JSON.parse(fakeWs.sent[0]);
    expect(msg.text).toBe("Hello there.");
    expect(msg.try_trigger_generation).toBe(true);
    expect(msg.flush).toBeUndefined();
  });

  it("writeText sends flush=true on isFinal", async () => {
    const streamPromise = openElevenLabsStream({
      voiceId: "voice-abc",
      onChunk: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    const stream = await streamPromise;

    fakeWs.sent.length = 0;
    stream.writeText("The end.", true);

    // Two messages: text + flush signal
    expect(fakeWs.sent.length).toBeGreaterThanOrEqual(1);
    const lastMsg = JSON.parse(fakeWs.sent[fakeWs.sent.length - 1]);
    expect(lastMsg.flush).toBe(true);
  });

  it("writeText sends only flush message when isFinal=true and text is empty", async () => {
    const streamPromise = openElevenLabsStream({
      voiceId: "voice-abc",
      onChunk: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    const stream = await streamPromise;

    fakeWs.sent.length = 0;
    stream.writeText("", true);

    expect(fakeWs.sent).toHaveLength(1);
    const msg = JSON.parse(fakeWs.sent[0]);
    expect(msg.text).toBe("");
    expect(msg.flush).toBe(true);
  });

  it("fires onChunk when audio message arrives", async () => {
    const onChunk = vi.fn();
    const streamPromise = openElevenLabsStream({
      voiceId: "voice-abc",
      onChunk,
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;

    const sampleAudio = Buffer.from([0x01, 0x02, 0x03]).toString("base64");
    fakeWs.emit("message", makeAudioMessage(sampleAudio));

    expect(onChunk).toHaveBeenCalledOnce();
    const chunk = onChunk.mock.calls[0][0] as Uint8Array;
    expect(chunk).toBeInstanceOf(Uint8Array);
    expect(chunk[0]).toBe(0x01);
    expect(chunk[1]).toBe(0x02);
    expect(chunk[2]).toBe(0x03);
  });

  it("fires onError when error message arrives", async () => {
    const onError = vi.fn();
    const streamPromise = openElevenLabsStream({
      voiceId: "voice-abc",
      onChunk: vi.fn(),
      onError,
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;

    fakeWs.emit("message", makeErrorMessage("Voice not found"));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Voice not found") }));
  });

  it("rejects the open promise when error fires before open", async () => {
    const streamPromise = openElevenLabsStream({
      voiceId: "voice-abc",
      onChunk: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.emit("error", new Error("connect refused"));
    await expect(streamPromise).rejects.toThrow("connect refused");
  });

  it("rejects the open promise when close fires before open", async () => {
    const streamPromise = openElevenLabsStream({
      voiceId: "voice-abc",
      onChunk: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.emit("close");
    await expect(streamPromise).rejects.toThrow("closed before open");
  });

  it("fires onClose when socket closes after open", async () => {
    const onClose = vi.fn();
    const streamPromise = openElevenLabsStream({
      voiceId: "voice-abc",
      onChunk: vi.fn(),
      onError: vi.fn(),
      onClose,
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;

    fakeWs.emit("close");
    expect(onClose).toHaveBeenCalled();
  });

  it("close() sends close signal to WebSocket", async () => {
    const streamPromise = openElevenLabsStream({
      voiceId: "voice-abc",
      onChunk: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    const stream = await streamPromise;

    stream.close();
    expect(fakeWs.readyState).toBe(WebSocket.CLOSED);
  });

  it("writeText is a no-op when socket is not OPEN", async () => {
    const streamPromise = openElevenLabsStream({
      voiceId: "voice-abc",
      onChunk: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    const stream = await streamPromise;

    fakeWs.readyState = WebSocket.CLOSING;
    fakeWs.sent.length = 0;
    stream.writeText("text after close", false);
    expect(fakeWs.sent).toHaveLength(0);
  });
});
