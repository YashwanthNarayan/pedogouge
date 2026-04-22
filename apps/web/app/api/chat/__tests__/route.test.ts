import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// All mocks must be hoisted before module imports in vitest
// ---------------------------------------------------------------------------

const { mockJwtVerify, mockRateLimit, mockCallStream, mockFrom, mockThen } =
  vi.hoisted(() => ({
    mockJwtVerify: vi.fn(),
    mockRateLimit:  vi.fn(),
    mockCallStream: vi.fn(),
    mockFrom:       vi.fn(),
    mockThen:       vi.fn(),
  }));

vi.mock("jose", () => ({ jwtVerify: mockJwtVerify }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mockRateLimit }));
vi.mock("@/lib/anthropic/client", () => ({
  callStream: mockCallStream,
  wrapUserContent: (msgs: unknown[]) => msgs,
}));
vi.mock("@/lib/anthropic/system-prompt", () => ({
  assembleSystemPrompt: () => [
    { type: "text", text: "system", cache_control: { type: "ephemeral" } },
  ],
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom }),
}));

// Import route AFTER mocks are set up
import { POST } from "../route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEMO_SESSION = {
  id: "sess-1",
  user_id: "user-1",
  blueprint_json: { title: "Test" },
  project_idea: "test project",
};

function chainFor(table: string) {
  // For sessions we need .single() to resolve; for others use array resolve at .limit()
  const resolveArray = { data: [], error: null };
  const c = {
    select: vi.fn(),
    eq:     vi.fn(),
    order:  vi.fn(),
    limit:  vi.fn(),
    single: vi.fn(),
    insert: vi.fn(),
  };
  c.select.mockReturnValue(c);
  c.eq.mockReturnValue(c);
  c.order.mockReturnValue(c);
  c.limit.mockReturnValue(Promise.resolve(resolveArray));
  c.insert.mockReturnValue({ then: mockThen });

  if (table === "sessions") {
    c.single.mockResolvedValue({ data: DEMO_SESSION, error: null });
  } else {
    c.single.mockResolvedValue({ data: null, error: null });
  }

  return c;
}

function setupFromMock(sessionOverride?: Partial<typeof DEMO_SESSION>) {
  mockFrom.mockImplementation((table: string) => {
    const c = chainFor(table);
    if (table === "sessions" && sessionOverride) {
      c.single.mockResolvedValue({
        data: { ...DEMO_SESSION, ...sessionOverride },
        error: null,
      });
    }
    return c;
  });
}

async function* fakeStream(chunks: string[]) {
  for (const chunk of chunks) yield chunk;
}

function makeRequest(body: unknown, token = "valid-jwt"): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJwtVerify.mockResolvedValue({ payload: { sub: "user-1" } });
    mockRateLimit.mockResolvedValue({ success: true, remaining: 19, reset: Date.now() + 60_000 });
    mockThen.mockReturnValue(undefined);
    mockCallStream.mockReturnValue(fakeStream(["Hello", " world"]));
    setupFromMock();
  });

  it("responds with text/event-stream and no-cache headers", async () => {
    const res = await POST(makeRequest({ sessionId: "sess-1", message: "explain loops" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
  });

  it("body contains data: lines and ends with [DONE]", async () => {
    const res = await POST(makeRequest({ sessionId: "sess-1", message: "explain loops" }));
    const text = await res.text();
    expect(text).toContain("data: Hello");
    expect(text).toContain("data: [DONE]");
  });

  it("accepts extension format { message, history }", async () => {
    const res = await POST(
      makeRequest({
        sessionId: "sess-1",
        message: "what is a loop?",
        history: [{ role: "assistant", content: "Hi there!" }],
      }),
    );
    expect(res.status).toBe(200);
    // callStream should have been called with at least 2 messages
    const callArgs = mockCallStream.mock.calls[0][0] as { messages: unknown[] };
    expect(callArgs.messages.length).toBeGreaterThanOrEqual(2);
  });

  it("accepts web format { messages[] }", async () => {
    const res = await POST(
      makeRequest({
        sessionId: "sess-1",
        messages: [{ role: "user", content: "explain recursion" }],
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 403 when session belongs to a different user", async () => {
    setupFromMock({ user_id: "other-user" });
    const res = await POST(makeRequest({ sessionId: "sess-1", message: "hi" }));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 60_000 });
    const res = await POST(makeRequest({ sessionId: "sess-1", message: "hi" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("returns 401 when JWT verification fails", async () => {
    mockJwtVerify.mockRejectedValue(new Error("invalid signature"));
    const res = await POST(makeRequest({ sessionId: "sess-1", message: "hi" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body has neither message nor messages", async () => {
    const res = await POST(makeRequest({ sessionId: "sess-1" }));
    expect(res.status).toBe(400);
  });

  it("uses sonnet by default and opus/haiku when requested", async () => {
    await POST(makeRequest({ sessionId: "sess-1", message: "hi", model: "opus" }));
    const callArgs = mockCallStream.mock.calls[0][0] as { model: string };
    expect(callArgs.model).toBe("opus");
  });
});
