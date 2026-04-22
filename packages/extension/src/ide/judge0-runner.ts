import * as vscode from "vscode";
import { createClient } from "@supabase/supabase-js";
import { Channels } from "@pedagogue/shared";
import { BackendClient } from "../backend/client";

// ── LRU tracker for recently-active documents ────────────────────────────────
// Updated by extension.ts's onDidChangeActiveTextEditor; used to rank files
// when the workspace has more than MAX_FILES open.
const _recentUris: string[] = [];
const MAX_FILES = 20;
const JUDGE0_TIMEOUT_MS = 35_000;

export function trackActiveDocument(uri: vscode.Uri): void {
  const key = uri.toString();
  const idx = _recentUris.indexOf(key);
  if (idx !== -1) _recentUris.splice(idx, 1);
  _recentUris.unshift(key);
  // Trim to a reasonable ceiling to prevent unbounded growth
  if (_recentUris.length > MAX_FILES * 3) _recentUris.length = MAX_FILES * 3;
}

// ── Language detection ────────────────────────────────────────────────────────
type SupportedLang = "python" | "javascript" | "typescript" | "java" | "cpp";

function _langFromExtname(ext: string): SupportedLang | undefined {
  switch (ext.toLowerCase()) {
    case ".py":    return "python";
    case ".js":    return "javascript";
    case ".ts":
    case ".tsx":   return "typescript";
    case ".java":  return "java";
    case ".c":
    case ".cpp":   return "cpp";
  }
  return undefined;
}

// ── Output channel (singleton) ────────────────────────────────────────────────
let _outputChannel: vscode.OutputChannel | undefined;

function _getOutputChannel(): vscode.OutputChannel {
  _outputChannel ??= vscode.window.createOutputChannel("Tutor Judge0");
  return _outputChannel;
}

// ── Execution result payload (broadcast by T3-10) ─────────────────────────────
type ExecutionCompletedPayload = {
  token?: string;
  status: string;
  passed?: number;
  failed?: number;
  stdout?: string;
  stderr?: string;
  compileOutput?: string;
  timeMs?: number;
  memoryKb?: number;
};

// ── Step 5 — Display result ───────────────────────────────────────────────────
function _displayResult(
  payload: ExecutionCompletedPayload,
  backendClient: BackendClient,
  sessionId: string,
  lang: string,
): void {
  const ch       = _getOutputChannel();
  const ts       = new Date().toLocaleString();
  const total    = (payload.passed ?? 0) + (payload.failed ?? 0);
  const timeSec  = payload.timeMs !== undefined ? (payload.timeMs / 1000).toFixed(2) : "?";
  const memMb    = payload.memoryKb !== undefined ? (payload.memoryKb / 1024).toFixed(1) : "?";
  const hr       = "─".repeat(50);

  ch.appendLine(`\n${hr}`);
  ch.appendLine(`Judge0 result  [${ts}]`);
  ch.appendLine(`Status: ${payload.status}  ·  Time: ${timeSec}s  ·  Memory: ${memMb} MB`);
  if (total > 0) ch.appendLine(`Tests: ${payload.passed ?? 0} passed, ${payload.failed ?? 0} failed`);
  ch.appendLine(hr);
  ch.appendLine("STDOUT:");
  ch.appendLine(payload.stdout || "(empty)");
  ch.appendLine("\nSTDERR:");
  ch.appendLine(payload.stderr || "(empty)");
  ch.appendLine("\nCOMPILE OUTPUT:");
  ch.appendLine(payload.compileOutput || "(empty)");
  ch.appendLine(hr);
  ch.show(true);

  const status   = payload.status ?? "";
  const isError  = /error|ce|tle|re/i.test(status);
  const anyFailed = (payload.failed ?? 0) > 0;

  if (isError) {
    const detail = (payload.compileOutput ?? payload.stderr ?? "").slice(0, 120);
    void vscode.window.showErrorMessage(
      `🔴 Judge0: ${status}${detail ? ` — ${detail}` : ""}`,
    );
  } else if (anyFailed) {
    void vscode.window.showWarningMessage(
      `❌ Judge0: ${payload.failed} test(s) failed — check 'Tutor Judge0' output`,
    );
  } else {
    void vscode.window.showInformationMessage(
      `✅ Judge0: ${payload.passed ?? 0}/${total} tests passed (${payload.timeMs ?? "?"}ms)`,
    );
  }

  // Reuse Haiku classifier when there's stderr on a non-passing run
  if ((isError || anyFailed) && payload.stderr) {
    const firstLine = payload.stderr.split("\n").find((l) => l.trim()) ?? payload.stderr;
    backendClient
      .request("/api/classify", {
        method: "POST",
        body: { sessionId, stderrLine: firstLine, language: lang },
      })
      .catch(() => {});
  }
}

// ── Step 4 — Wait for Realtime result ────────────────────────────────────────
function _waitForResult(
  runId: string,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<ExecutionCompletedPayload | null> {
  return new Promise((resolve) => {
    const client  = createClient(supabaseUrl, supabaseAnonKey);
    let settled   = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        void channel.unsubscribe();
        void vscode.window.showErrorMessage("Judge0 timed out — no result after 35s");
        resolve(null);
      }
    }, JUDGE0_TIMEOUT_MS);

    const channel = client
      .channel(Channels.execution(runId))
      .on(
        "broadcast",
        { event: "execution_completed" },
        ({ payload }: { payload: unknown }) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            void channel.unsubscribe();
            resolve(payload as ExecutionCompletedPayload);
          }
        },
      )
      .subscribe();
  });
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function runWithJudge0(
  _context: vscode.ExtensionContext,
  backendClient: BackendClient,
  getSessionId: () => string | undefined,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<void> {
  // Step 1 — Determine entrypoint and language
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showErrorMessage("No active file to run");
    return;
  }
  const extname = editor.document.uri.fsPath.match(/(\.[^./\\]+)$/)?.[1] ?? "";
  const lang    = _langFromExtname(extname);
  if (!lang) {
    void vscode.window.showErrorMessage(`Unsupported language for Judge0: '${extname}'`);
    return;
  }

  // Step 2 — Collect open workspace files (LRU-capped)
  let docs = vscode.workspace.textDocuments.filter(
    (d) => d.uri.scheme === "file" && !d.isUntitled,
  );
  if (docs.length > MAX_FILES) {
    void vscode.window.showWarningMessage(
      `Workspace has ${docs.length} open files; submitting the ${MAX_FILES} most recently active.`,
    );
    docs = docs
      .slice()
      .sort((a, b) => {
        const ai = _recentUris.indexOf(a.uri.toString());
        const bi = _recentUris.indexOf(b.uri.toString());
        return (ai === -1 ? 1e9 : ai) - (bi === -1 ? 1e9 : bi);
      })
      .slice(0, MAX_FILES);
  }
  const files = docs.map((d) => ({
    path: vscode.workspace.asRelativePath(d.uri),
    content: d.getText(),
  }));

  // Step 3 — Submit under progress notification, then wait for result
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Tutor: submitting to Judge0…",
      cancellable: false,
    },
    async (progress) => {
      const sessionId = getSessionId();
      if (!sessionId) {
        void vscode.window.showErrorMessage("No active session — sign in first");
        return;
      }

      let runId: string;
      try {
        const res = await backendClient.request<{ runId: string; status: string }>(
          "/api/execute",
          { method: "POST", body: { sessionId, files, lang } },
        );
        runId = res.runId;
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Judge0 submission failed: ${(err as Error).message}`,
        );
        return;
      }

      progress.report({ message: `queued (${runId.slice(0, 8)}…)` });

      const payload = await _waitForResult(runId, supabaseUrl, supabaseAnonKey);
      if (!payload) return; // timeout already showed the error message

      _displayResult(payload, backendClient, sessionId, lang);
    },
  );
}
