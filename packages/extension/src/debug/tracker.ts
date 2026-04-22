import * as vscode from "vscode";
import { BackendClient } from "../backend/client";

// DAP message shapes (minimal — only the fields we act on)
type DapMessage = {
  type: string;
  event?: string;
  body?: Record<string, unknown>;
};

type StackFrame = {
  id: number;
  name: string;
  source?: { path?: string };
  line: number;
  column: number;
};

type Scope = {
  name: string;
  variablesReference: number;
};

type Variable = {
  name: string;
  value: string;
  type?: string;
};

type StoppedBody = {
  reason: string;
  threadId?: number;
  description?: string;
  text?: string;
};

const ACTIONED_REASONS = new Set(["breakpoint", "exception"]);

export class TutorDebugTracker implements vscode.DebugAdapterTracker {
  // Guard against overlapping narrations for rapid stop events
  private _narrating = false;

  constructor(
    private readonly _session: vscode.DebugSession,
    private readonly _client: BackendClient,
    private readonly _outputChannel: vscode.OutputChannel,
    private readonly _getSessionId: () => string | undefined,
  ) {}

  onWillReceiveMessage(_message: unknown): void {
    // No-op — we don't intercept outgoing requests
  }

  onDidSendMessage(message: unknown): void {
    const msg = message as DapMessage;
    if (msg.type !== "event") return;

    switch (msg.event) {
      case "stopped": {
        const body = msg.body as StoppedBody | undefined;
        if (!body || !ACTIONED_REASONS.has(body.reason)) return;
        if (this._narrating) return;
        this._narrating = true;
        this._onStopped(body).catch((err: Error) => {
          console.error("[TutorDap] narration error:", err.message);
        }).finally(() => {
          this._narrating = false;
        });
        break;
      }
      case "exited":
        // Session ended — nothing to clean up beyond the narrating flag
        this._narrating = false;
        break;
      case "output": {
        // Swallow stderr output events — PtyNarrator already handles them
        const category = (msg.body as { category?: string } | undefined)?.category;
        if (category === "stderr") return;
        break;
      }
    }
  }

  onError(error: Error): void {
    console.error("[TutorDap]", error.message);
  }

  onExit(_code: number | undefined, _signal: string | undefined): void {
    // No-op
  }

  private async _onStopped(body: StoppedBody): Promise<void> {
    const sessionId = this._getSessionId();

    // Step 1 — call stack
    let stackFrames: StackFrame[] = [];
    try {
      const stackResp = await this._session.customRequest("stackTrace", {
        threadId: body.threadId ?? 1,
        levels: 5,
      }) as { stackFrames: StackFrame[] };
      stackFrames = stackResp.stackFrames ?? [];
    } catch {
      // Session may have already resumed — bail out gracefully
      return;
    }

    const topFrame = stackFrames[0];
    if (!topFrame) return;

    // Step 2 — local variables from the top frame
    let variables: Variable[] = [];
    try {
      const scopesResp = await this._session.customRequest("scopes", {
        frameId: topFrame.id,
      }) as { scopes: Scope[] };

      const locals = scopesResp.scopes.find((s) => s.name === "Locals");
      if (locals) {
        const varsResp = await this._session.customRequest("variables", {
          variablesReference: locals.variablesReference,
        }) as { variables: Variable[] };
        variables = (varsResp.variables ?? []).slice(0, 10);
      }
    } catch {
      // Variables are best-effort
    }

    // Step 3 — build context string
    const location   = `${topFrame.source?.path ?? "<unknown>"}:${topFrame.line}`;
    const frameList  = stackFrames
      .map((f) => `${f.name} @ ${f.source?.path ?? "<unknown>"}:${f.line}`)
      .join(" → ");
    const varList    = variables.length > 0
      ? variables.map((v) => `${v.name} (${v.type ?? "?"}) = ${v.value}`).join(", ")
      : "(none)";

    const context =
      `Stopped at: ${location} in ${topFrame.name}\n` +
      `Reason: ${body.reason} ${body.description ?? ""}\n` +
      `Local variables: ${varList}\n` +
      `Top ${stackFrames.length} frames: ${frameList}`;

    const chatMessage =
      `@tutor [DAP] I'm paused at a ${body.reason}. Here's my debug state:\n${context}`;

    // Step 4 — stream the narration to the output channel
    this._outputChannel.appendLine(`\n[${new Date().toLocaleTimeString()}] ${location}`);
    this._outputChannel.appendLine("─".repeat(60));
    this._outputChannel.show(true);

    if (sessionId) {
      try {
        for await (const chunk of this._client.streamSSE(
          "/api/chat",
          { sessionId, message: chatMessage, history: [] },
        )) {
          // Each chunk is a JSON-encoded SSE data payload — extract text delta
          let text = chunk;
          try {
            const parsed = JSON.parse(chunk) as { delta?: string; text?: string };
            text = parsed.delta ?? parsed.text ?? chunk;
          } catch {
            // Raw string chunk — use as-is
          }
          this._outputChannel.append(text);
        }
      } catch {
        // Streaming failed — write the raw context so the student still sees state
        this._outputChannel.appendLine(context);
      }
    } else {
      // No session — still show the debug state so it's useful offline
      this._outputChannel.appendLine(context);
    }

    this._outputChannel.appendLine("");

    // Step 5 — fire intervention for exceptions
    if (body.reason === "exception" && sessionId) {
      this._client
        .request("/api/intervene", {
          method: "POST",
          body: { sessionId, conceptId: "debugging", strugglePattern: "conceptual_gap" },
        })
        .catch(() => {});
    }
  }
}
