import * as vscode from "vscode";
import { BackendClient } from "../backend/client";

const TICK_INTERVAL_MS  = 30_000;
const WARNED_STATE_KEY  = "pedagogue.snapshotChainBrokenWarned";

export class SnapshotTicker implements vscode.Disposable {
  private _interval: ReturnType<typeof setInterval> | undefined;
  private readonly _client: BackendClient;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _getSessionId: () => string | undefined,
  ) {
    this._client = new BackendClient(_context.secrets);
  }

  start(): void {
    void this._tick();
    this._interval = setInterval(() => void this._tick(), TICK_INTERVAL_MS);
  }

  stop(): void {
    clearInterval(this._interval);
    this._interval = undefined;
  }

  private async _tick(): Promise<void> {
    const sessionId = this._getSessionId();
    if (!sessionId) return;

    const docs = vscode.workspace.textDocuments.filter(
      (d) => d.uri.scheme === "file" && !d.isUntitled,
    );
    if (docs.length === 0) return;

    const files: Record<string, string> = {};
    for (const doc of docs) {
      files[vscode.workspace.asRelativePath(doc.uri)] = doc.getText();
    }

    try {
      await this._client.request("/api/snapshots", {
        method: "POST",
        body: { sessionId, ts: Date.now(), files, prevHash: "" },
      });
    } catch (err) {
      if ((err as { status?: number }).status === 409) {
        const warned = this._context.workspaceState.get<boolean>(WARNED_STATE_KEY);
        if (!warned) {
          void vscode.window.showWarningMessage(
            "Snapshot chain broken — restart your session to resume tracking",
          );
          void this._context.workspaceState.update(WARNED_STATE_KEY, true);
        }
      }
      // All other errors: silent — never let tick() throw
    }
  }

  dispose(): void {
    this.stop();
  }
}
