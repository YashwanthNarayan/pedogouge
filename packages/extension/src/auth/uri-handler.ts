import * as vscode from "vscode";
import { SecretStore } from "./secrets";

// Matches auth codes: alphanumeric + dash/underscore, reasonable length bounds
const CODE_RE = /^[A-Za-z0-9_-]{10,512}$/;
const STATE_TTL_MS = 5 * 60 * 1000;

type AuthResult = { state: string; token: string };

function getBackendUrl(): string {
  const cfg = vscode.workspace.getConfiguration("pedagogue");
  return (cfg.get<string>("backendUrl") ?? "https://pedagogue.app").replace(/\/$/, "");
}

export class PedagogueUriHandler implements vscode.UriHandler, vscode.Disposable {
  private readonly _onDidAuth = new vscode.EventEmitter<AuthResult>();
  readonly onDidAuth: vscode.Event<AuthResult> = this._onDidAuth.event;

  constructor(private readonly secrets: SecretStore) {}

  dispose(): void {
    this._onDidAuth.dispose();
  }

  handleUri(uri: vscode.Uri): void {
    // Fire-and-forget; errors are swallowed — unknown state or bad request stays silent
    this._handle(uri).catch(() => undefined);
  }

  private async _handle(uri: vscode.Uri): Promise<void> {
    if (uri.path !== "/callback") return;

    const params = new URLSearchParams(uri.query);
    const code = params.get("code");
    const state = params.get("state");

    if (!code || !state || !CODE_RE.test(code)) return;

    const pending = await this.secrets.getPending(state);
    if (!pending) return; // unknown state — silently reject

    if (Date.now() - pending.createdAt > STATE_TTL_MS) {
      await this.secrets.deletePending(state);
      return;
    }

    // Anti-replay: consume the pending entry before exchanging with backend
    await this.secrets.deletePending(state);

    const res = await fetch(`${getBackendUrl()}/api/auth/extension-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state, verifier: pending.verifier }),
    });

    if (!res.ok) return;

    const data = (await res.json()) as { token?: unknown };
    if (typeof data.token !== "string" || !data.token) return;

    await this.secrets.storeToken(data.token);
    this._onDidAuth.fire({ state, token: data.token });
  }
}
