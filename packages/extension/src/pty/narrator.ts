import * as vscode from "vscode";
import { spawn, type ChildProcess } from "child_process";

// Runtime map: VS Code languageId → [executable, argPrefix]
const RUNTIME_MAP: Record<string, [string, string[]]> = {
  python:          ["python3", []],
  javascript:      ["node",    []],
  typescript:      ["npx",     ["ts-node"]],
  typescriptreact: ["npx",     ["ts-node"]],
  java:            ["java",    []],
  c:               ["gcc",     []],
};

export class PtyNarrator implements vscode.Disposable {
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _stderrHandlers: Array<(chunk: string) => void> = [];

  constructor(private readonly _context: vscode.ExtensionContext) {}

  // Creates a VS Code terminal backed by a Pseudoterminal.
  // Spawns an appropriate runtime for the active file's language on open().
  createTerminal(name: string): vscode.Terminal {
    const writeEmitter = new vscode.EventEmitter<string>();
    const closeEmitter = new vscode.EventEmitter<number | void>();
    let proc: ChildProcess | undefined;

    // Capture stderrHandlers in closure so PTY callbacks can reach them
    const stderrHandlers = this._stderrHandlers;

    const pty: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
      onDidClose: closeEmitter.event,

      open(_dims) {
        const editor   = vscode.window.activeTextEditor;
        const filePath = editor?.document.uri.fsPath;
        const langId   = editor?.document.languageId ?? "";

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
          // TODO(T1-09): pipe to BackendClient '/api/classify' → interventions
          for (const h of stderrHandlers) h(text);
        });

        proc.on("exit", (code) => {
          writeEmitter.fire(`\r\n[Process exited with code ${code ?? "?"}]\r\n`);
          closeEmitter.fire(code ?? 0);
        });

        proc.on("error", (err) => {
          writeEmitter.fire(`\r\n\x1b[31mFailed to spawn '${cmd}': ${err.message}\x1b[0m\r\n`);
          closeEmitter.fire(1);
        });
      },

      close() {
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

  // Register a handler that receives raw stderr text from the child process.
  // TODO(T1-09): wire to Haiku classifier → DiagnosticCollection on every chunk
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
