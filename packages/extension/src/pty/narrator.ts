import * as vscode from "vscode";
import { spawn, type ChildProcess } from "child_process";
import { BackendClient } from "../backend/client";
import { tutorCollection } from "../diagnostics/collection";

// Runtime map: VS Code languageId → [executable, argPrefix]
const RUNTIME_MAP: Record<string, [string, string[]]> = {
  python:          ["python3", []],
  javascript:      ["node",    []],
  typescript:      ["npx",     ["ts-node"]],
  typescriptreact: ["npx",     ["ts-node"]],
  java:            ["java",    []],
  c:               ["gcc",     []],
};

const HIGH_CONFIDENCE = 0.7;
const MIN_CONFIDENCE  = 0.4;
const DEBOUNCE_MS     = 800;

type ClassifyResponse = {
  conceptIds: Array<{ id: string; confidence: number }>;
  suggestionMd: string;
};

export class PtyNarrator implements vscode.Disposable {
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _stderrHandlers: Array<(chunk: string) => void> = [];
  private readonly _client: BackendClient;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _getSessionId: () => string | undefined,
  ) {
    this._client = new BackendClient(_context.secrets);
  }

  // Creates a VS Code terminal backed by a Pseudoterminal.
  // Spawns an appropriate runtime for the active file's language on open().
  createTerminal(name: string): vscode.Terminal {
    const writeEmitter = new vscode.EventEmitter<string>();
    const closeEmitter = new vscode.EventEmitter<number | void>();
    let proc: ChildProcess | undefined;

    // Per-terminal debounce state
    let stderrBuffer = "";
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let terminalDoc: vscode.TextDocument | undefined;
    let terminalLangId = "";

    // Capture in closures so PTY callbacks can reach them
    const stderrHandlers = this._stderrHandlers;
    const narrator = this;

    const pty: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
      onDidClose: closeEmitter.event,

      open(_dims) {
        const editor   = vscode.window.activeTextEditor;
        const filePath = editor?.document.uri.fsPath;
        const langId   = editor?.document.languageId ?? "";
        terminalDoc    = editor?.document;
        terminalLangId = langId;

        const [cmd, prefix] = RUNTIME_MAP[langId] ?? ["bash", []];
        const args = filePath ? [...prefix, filePath] : prefix;

        writeEmitter.fire(`Running: ${[cmd, ...args].join(" ")}\r\n`);

        proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });

        proc.stdout?.on("data", (chunk: Buffer) => {
          writeEmitter.fire(chunk.toString().replace(/\n/g, "\r\n"));
        });

        proc.stderr?.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          writeEmitter.fire(`\x1b[31m${text.replace(/\n/g, "\r\n")}\x1b[0m`);
          for (const h of stderrHandlers) h(text);

          if (terminalDoc) {
            stderrBuffer += text;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              const buf = stderrBuffer;
              stderrBuffer = "";
              narrator._classifyStderr(buf, terminalDoc!, terminalLangId).catch(() => {});
            }, DEBOUNCE_MS);
          }
        });

        proc.on("exit", (code) => {
          writeEmitter.fire(`\r\n[Process exited with code ${code ?? "?"}]\r\n`);
          closeEmitter.fire(code ?? 0);

          if (code === 0 && terminalDoc) {
            clearTimeout(debounceTimer);
            stderrBuffer = "";
            narrator._clearStderrDiagnostics(terminalDoc.uri);
          }
        });

        proc.on("error", (err) => {
          writeEmitter.fire(`\r\n\x1b[31mFailed to spawn '${cmd}': ${err.message}\x1b[0m\r\n`);
          closeEmitter.fire(1);
        });
      },

      close() {
        clearTimeout(debounceTimer);
        proc?.kill();
      },

      handleInput(data: string) {
        proc?.stdin?.write(data);
      },
    };

    const terminal = vscode.window.createTerminal({ name, pty });
    this._disposables.push(terminal, writeEmitter, closeEmitter);
    return terminal;
  }

  private async _classifyStderr(
    buffer: string,
    doc: vscode.TextDocument,
    langId: string,
  ): Promise<void> {
    const sessionId = this._getSessionId();
    if (!sessionId) return;

    const lines = buffer.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;

    const stderrLine  = lines[0]!;
    const contextLines = lines.slice(1, 6);

    let response: ClassifyResponse;
    try {
      response = await this._client.request<ClassifyResponse>("/api/classify", {
        method: "POST",
        body: {
          stderrLine,
          language: langId,
          sessionId,
          ...(contextLines.length > 0 ? { contextLines } : {}),
        },
      });
    } catch {
      return;
    }

    const significant = response.conceptIds.filter((c) => c.confidence >= MIN_CONFIDENCE);
    if (significant.length === 0) return;

    const lineNum = _parseStderrLineNumber(stderrLine);
    const range   = new vscode.Range(
      new vscode.Position(lineNum, 0),
      new vscode.Position(lineNum, 0),
    );

    const stderrDiags: vscode.Diagnostic[] = significant.map(({ id, confidence }) => {
      const severity =
        confidence >= HIGH_CONFIDENCE
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning;
      const diag = new vscode.Diagnostic(range, response.suggestionMd || id, severity);
      diag.source = "tutor-stderr";
      diag.code   = id;
      return diag;
    });

    // Append without clobbering AST diagnostics
    const existing = tutorCollection.get(doc.uri) ?? [];
    tutorCollection.set(doc.uri, [...existing, ...stderrDiags]);

    // Nudge + intervene for high-confidence concepts
    for (const { id, confidence } of significant) {
      if (confidence < HIGH_CONFIDENCE) continue;

      vscode.window.showInformationMessage(
        `@tutor: Runtime error maps to "${id}". ${response.suggestionMd}`,
      );

      this._client
        .request("/api/intervene", {
          method: "POST",
          body: { sessionId, conceptId: id, strugglePattern: "conceptual_gap" },
        })
        .catch(() => {});
    }
  }

  private _clearStderrDiagnostics(uri: vscode.Uri): void {
    const existing = tutorCollection.get(uri) ?? [];
    const filtered = [...existing].filter((d) => d.source !== "tutor-stderr");
    if (filtered.length === 0) {
      tutorCollection.delete(uri);
    } else {
      tutorCollection.set(uri, filtered);
    }
  }

  // Register a handler that receives raw stderr text from the child process.
  onStderr(handler: (chunk: string) => void): vscode.Disposable {
    this._stderrHandlers.push(handler);
    return new vscode.Disposable(() => {
      const idx = this._stderrHandlers.indexOf(handler);
      if (idx !== -1) this._stderrHandlers.splice(idx, 1);
    });
  }

  dispose(): void {
    vscode.Disposable.from(...this._disposables).dispose();
    this._stderrHandlers.length = 0;
  }
}

// Extract a 0-based line number from a stderr line.
// Handles Python ("line 42"), Node.js ("file.js:42:"), and generic (":42:") formats.
function _parseStderrLineNumber(line: string): number {
  const wordMatch   = line.match(/\bline\s+(\d+)/i);
  if (wordMatch) return Math.max(0, parseInt(wordMatch[1]!, 10) - 1);
  const colonMatch  = line.match(/:(\d+):/);
  if (colonMatch) return Math.max(0, parseInt(colonMatch[1]!, 10) - 1);
  return 0;
}
