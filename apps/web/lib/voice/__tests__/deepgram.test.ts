import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";

// ---------------------------------------------------------------------------
// Mock the 'ws' module with a controllable fake WebSocket
// ---------------------------------------------------------------------------
let fakeWs: ReturnType<typeof makeFakeWs>;

function makeFakeWs() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const sent: (Buffer | ArrayBuffer)[] = [];
  let readyState = WebSocket.CONNECTING as number;

  return {
    get readyState() { return readyState; },
    set readyState(v: number) { readyState = v; },
    sent,
    on(event: string, cb: (...args: unknown[]) => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    },
    send(data: Buffer | ArrayBuffer) {
      sent.push(data);
    },
    close() {
      readyState = WebSocket.CLOSED;
      (listeners["close"] ?? []).forEach((cb) => cb(1000, "normal"));
    },
    emit(event: string, ...args: unknown[]) {
      (listeners[event] ?? []).forEach((cb) => cb(...args));
    },
    // Make it look like a WebSocket class instance
    OPEN: WebSocket.OPEN,
  };
}

vi.mock("ws", () => {
  const WS = vi.fn().mockImplementation(() => {
    fakeWs = makeFakeWs();
    return fakeWs;
  });
  // Expose static constants
  (WS as unknown as Record<string, number>).OPEN = 1;
  (WS as unknown as Record<string, number>).CONNECTING = 0;
  (WS as unknown as Record<string, number>).CLOSING = 2;
  (WS as unknown as Record<string, number>).CLOSED = 3;
  return { default: WS };
});

// ---------------------------------------------------------------------------
// Import after mock is set up
// ---------------------------------------------------------------------------
import { openDeepgramStream } from "../deepgram-client";

function buildResultMessage(transcript: string, isFinal: boolean): Buffer {
  return Buffer.from(
    JSON.stringify({
      type: "Results",
      channel: {
        alternatives: [{ transcript, confidence: 0.95 }],
      },
      is_final: isFinal,
      speech_final: isFinal,
    })
  );
}

function buildUtteranceEndMessage(): Buffer {
  return Buffer.from(JSON.stringify({ type: "UtteranceEnd" }));
}

function buildMetadataMessage(): Buffer {
  return Buffer.from(
    JSON.stringify({
      type: "Metadata",
      transaction_key: "xyz",
      request_id: "req-123",
    })
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("openDeepgramStream", () => {
  beforeEach(() => {
    process.env.DEEPGRAM_API_KEY = "test-dg-key";
  });

  afterEach(() => {
    delete process.env.DEEPGRAM_API_KEY;
    vi.clearAllMocks();
  });

  it("throws when DEEPGRAM_API_KEY is not set", async () => {
    delete process.env.DEEPGRAM_API_KEY;
    await expect(
      openDeepgramStream({
        onTranscript: vi.fn(),
        onError: vi.fn(),
        onClose: vi.fn(),
      })
    ).rejects.toThrow("DEEPGRAM_API_KEY");
  });

  it("opens a WebSocket to Deepgram WSS endpoint", async () => {
    const streamPromise = openDeepgramStream({
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    // Trigger open event to resolve the promise
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;
    // The WS constructor was called with the Deepgram URL
    const WS = (await import("ws")).default;
    const constructorCall = vi.mocked(WS).mock.calls[0];
    const url = constructorCall[0] as string;
    expect(url).toMatch(/^wss:\/\/api\.deepgram\.com\/v1\/listen/);
  });

  it("includes retain=false in the connection URL (no audio retention)", async () => {
    const streamPromise = openDeepgramStream({
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;

    const WS = (await import("ws")).default;
    const url = vi.mocked(WS).mock.calls[0][0] as string;
    expect(url).toContain("retain=false");
  });

  it("includes model=nova-3 in the connection URL", async () => {
    const streamPromise = openDeepgramStream({
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;

    const WS = (await import("ws")).default;
    const url = vi.mocked(WS).mock.calls[0][0] as string;
    expect(url).toContain("model=nova-3");
    expect(url).toContain("interim_results=true");
    expect(url).toContain("smart_format=true");
  });

  it("sends audio buffers when send() is called", async () => {
    const streamPromise = openDeepgramStream({
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    const stream = await streamPromise;

    const chunk = Buffer.from([0x00, 0x01, 0x02]);
    stream.send(chunk);
    expect(fakeWs.sent).toContain(chunk);
  });

  it("does NOT send audio when socket is not OPEN", async () => {
    const streamPromise = openDeepgramStream({
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    const stream = await streamPromise;

    fakeWs.readyState = WebSocket.CLOSING;
    stream.send(Buffer.from([0xff]));
    expect(fakeWs.sent).toHaveLength(0); // nothing was sent
  });

  it("fires onTranscript with isFinal=false for interim results", async () => {
    const onTranscript = vi.fn();
    const streamPromise = openDeepgramStream({
      onTranscript,
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;

    fakeWs.emit("message", buildResultMessage("hello world", false));
    expect(onTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ text: "hello world", isFinal: false, utteranceEnd: false })
    );
  });

  it("fires onTranscript with isFinal=true for final Results", async () => {
    const onTranscript = vi.fn();
    const streamPromise = openDeepgramStream({
      onTranscript,
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;

    fakeWs.emit("message", buildResultMessage("this is final", true));
    expect(onTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ text: "this is final", isFinal: true, utteranceEnd: false })
    );
  });

  it("fires onTranscript with utteranceEnd=true on UtteranceEnd message", async () => {
    const onTranscript = vi.fn();
    const streamPromise = openDeepgramStream({
      onTranscript,
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;

    fakeWs.emit("message", buildUtteranceEndMessage());
    expect(onTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ text: "", isFinal: true, utteranceEnd: true })
    );
  });

  it("does NOT fire onTranscript for Metadata messages", async () => {
    const onTranscript = vi.fn();
    const streamPromise = openDeepgramStream({
      onTranscript,
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;

    fakeWs.emit("message", buildMetadataMessage());
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("fires onError when a post-open error occurs", async () => {
    const onError = vi.fn();
    const streamPromise = openDeepgramStream({
      onTranscript: vi.fn(),
      onError,
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;

    const err = new Error("network failure");
    fakeWs.emit("error", err);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it("rejects the open promise when error fires before open", async () => {
    const streamPromise = openDeepgramStream({
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    const err = new Error("connection refused");
    fakeWs.emit("error", err);
    await expect(streamPromise).rejects.toThrow("connection refused");
  });

  it("rejects the open promise when close fires before open", async () => {
    const streamPromise = openDeepgramStream({
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.emit("close", 1006, "abnormal");
    await expect(streamPromise).rejects.toThrow(/Deepgram closed before open/);
  });

  it("sends a zero-byte buffer when close() is called (Deepgram protocol)", async () => {
    const streamPromise = openDeepgramStream({
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    const stream = await streamPromise;

    stream.close();
    // First sent item should be the zero-byte signal
    expect(fakeWs.sent[0]).toBeInstanceOf(Buffer);
    expect((fakeWs.sent[0] as Buffer).byteLength).toBe(0);
  });

  it("fires onClose when Deepgram closes normally after stream is open", async () => {
    const onClose = vi.fn();
    const streamPromise = openDeepgramStream({
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onClose,
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;

    fakeWs.emit("close", 1000, "");
    expect(onClose).toHaveBeenCalled();
  });

  it("includes confidence in onTranscript when available", async () => {
    const onTranscript = vi.fn();
    const streamPromise = openDeepgramStream({
      onTranscript,
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;

    fakeWs.emit("message", buildResultMessage("hello", false));
    expect(onTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ confidence: 0.95 })
    );
  });

  it("does not crash on malformed message payloads", async () => {
    const onTranscript = vi.fn();
    const streamPromise = openDeepgramStream({
      onTranscript,
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await streamPromise;

    // Should not throw
    expect(() => fakeWs.emit("message", Buffer.from("not valid json {{{"))).not.toThrow();
    expect(onTranscript).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TurnManager integration tests
// ---------------------------------------------------------------------------
describe("TurnManager", () => {
  beforeEach(() => {
    process.env.DEEPGRAM_API_KEY = "test-dg-key";
  });

  afterEach(() => {
    delete process.env.DEEPGRAM_API_KEY;
    vi.clearAllMocks();
  });

  it("buffers interim results and fires onTranscriptReady on UtteranceEnd", async () => {
    const { TurnManager } = await import("../turn-manager");
    const onTranscriptReady = vi.fn();

    const tm = new TurnManager({
      sessionId: "sess-123",
      onClaudeTextDelta: vi.fn(),
      onClaudeToolCall: vi.fn(),
      onTTSChunk: vi.fn(),
      onTranscriptReady,
      onClose: vi.fn(),
      onError: vi.fn(),
    });

    const openPromise = tm.open();
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await openPromise;

    // Send interim transcript (not accumulated)
    fakeWs.emit("message", buildResultMessage("hello", false));
    expect(onTranscriptReady).not.toHaveBeenCalled();

    // Final segment 1
    fakeWs.emit("message", buildResultMessage("hello", true));
    expect(onTranscriptReady).not.toHaveBeenCalled();

    // Final segment 2
    fakeWs.emit("message", buildResultMessage("world", true));
    expect(onTranscriptReady).not.toHaveBeenCalled();

    // UtteranceEnd fires the callback with accumulated text
    fakeWs.emit("message", buildUtteranceEndMessage());
    expect(onTranscriptReady).toHaveBeenCalledWith("hello world");
  });

  it("resets transcript buffer on cancel()", async () => {
    const { TurnManager } = await import("../turn-manager");
    const onTranscriptReady = vi.fn();

    const tm = new TurnManager({
      sessionId: "sess-456",
      onClaudeTextDelta: vi.fn(),
      onClaudeToolCall: vi.fn(),
      onTTSChunk: vi.fn(),
      onTranscriptReady,
      onClose: vi.fn(),
      onError: vi.fn(),
    });

    const openPromise = tm.open();
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await openPromise;

    // Accumulate some finals
    fakeWs.emit("message", buildResultMessage("cancel me", true));

    // Barge-in: cancel clears the buffer
    await tm.cancel();

    // UtteranceEnd should NOT fire callback (buffer was cleared)
    fakeWs.emit("message", buildUtteranceEndMessage());
    expect(onTranscriptReady).not.toHaveBeenCalled();
  });

  it("forwards audio buffers to Deepgram via pushAudio()", async () => {
    const { TurnManager } = await import("../turn-manager");

    const tm = new TurnManager({
      sessionId: "sess-789",
      onClaudeTextDelta: vi.fn(),
      onClaudeToolCall: vi.fn(),
      onTTSChunk: vi.fn(),
      onTranscriptReady: vi.fn(),
      onClose: vi.fn(),
      onError: vi.fn(),
    });

    const openPromise = tm.open();
    fakeWs.readyState = WebSocket.OPEN;
    fakeWs.emit("open");
    await openPromise;

    const chunk = Buffer.from([0x10, 0x20, 0x30]);
    await tm.pushAudio(chunk);
    expect(fakeWs.sent).toContain(chunk);
  });

  it("throws if pushAudio() is called before open()", async () => {
    const { TurnManager } = await import("../turn-manager");

    const tm = new TurnManager({
      sessionId: "sess-err",
      onClaudeTextDelta: vi.fn(),
      onClaudeToolCall: vi.fn(),
      onTTSChunk: vi.fn(),
      onTranscriptReady: vi.fn(),
      onClose: vi.fn(),
      onError: vi.fn(),
    });

    await expect(tm.pushAudio(Buffer.alloc(10))).rejects.toThrow("open()");
  });
});
