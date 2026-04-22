import * as vscode from "vscode";
import * as crypto from "crypto";
import { SecretStore } from "./secrets";
import { PedagogueUriHandler } from "./uri-handler";

const PROVIDER_ID = "pedagogue";
const PROVIDER_LABEL = "Pedagogue";
const SESSION_ID = "pedagogue-session";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

// mock.eyJzdWIiOiJtb2NrLXVzZXIiLCJlbWFpbCI6InN0dWRlbnRAZXhhbXBsZS5jb20ifQ.mock
// payload decodes to: {"sub":"mock-user","email":"student@example.com"}
const MOCK_TOKEN =
  "mock.eyJzdWIiOiJtb2NrLXVzZXIiLCJlbWFpbCI6InN0dWRlbnRAZXhhbXBsZS5jb20ifQ.mock";

function getBackendUrl(): string {
  const cfg = vscode.workspace.getConfiguration("pedagogue");
  return (cfg.get<string>("backendUrl") ?? "https://pedagogue.app").replace(/\/$/, "");
}

function decodeAccount(token: string): { id: string; label: string } {
  try {
    const payload = token.split(".")[1];
    if (payload) {
      const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as {
        sub?: string;
        email?: string;
        name?: string;
      };
      return { id: json.sub ?? "unknown", label: json.email ?? json.name ?? "Student" };
    }
  } catch {
    // fall through to default
  }
  return { id: "unknown", label: "Student" };
}

export class PedagogueAuthProvider
  implements vscode.AuthenticationProvider, vscode.Disposable
{
  static readonly PROVIDER_ID = PROVIDER_ID;
  static readonly PROVIDER_LABEL = PROVIDER_LABEL;

  private readonly _onDidChangeSessions =
    new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
  readonly onDidChangeSessions = this._onDidChangeSessions.event;

  private readonly _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly secrets: SecretStore,
    private readonly uriHandler: PedagogueUriHandler,
  ) {}

  dispose(): void {
    this._onDidChangeSessions.dispose();
    vscode.Disposable.from(...this._disposables).dispose();
  }

  async getSessions(
    _scopes: readonly string[] | undefined,
    _options?: vscode.AuthenticationProviderSessionOptions,
  ): Promise<vscode.AuthenticationSession[]> {
    const token = await this.secrets.getToken();
    if (!token) return [];
    return [
      {
        id: SESSION_ID,
        accessToken: token,
        account: decodeAccount(token),
        scopes: [],
      },
    ];
  }

  async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
    if (process.env.PEDAGOGUE_MOCK_AUTH === "true") {
      return this._mockSession(scopes);
    }

    const state = crypto.randomBytes(32).toString("hex");
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest().toString("base64url");

    await this.secrets.storePending(state, { verifier, createdAt: Date.now() });

    const url = `${getBackendUrl()}/auth/extension?state=${state}&challenge=${challenge}`;
    await vscode.env.openExternal(vscode.Uri.parse(url));

    const token = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        sub.dispose();
        this.secrets.deletePending(state).catch(() => undefined);
        reject(new Error("Sign-in timed out — no response within 5 minutes"));
      }, AUTH_TIMEOUT_MS);

      const sub = this.uriHandler.onDidAuth(({ state: s, token: t }) => {
        if (s !== state) return;
        clearTimeout(timer);
        sub.dispose();
        resolve(t);
      });

      this._disposables.push(sub);
    });

    const session: vscode.AuthenticationSession = {
      id: SESSION_ID,
      accessToken: token,
      account: decodeAccount(token),
      scopes: Array.from(scopes),
    };

    this._onDidChangeSessions.fire({ added: [session], changed: [], removed: [] });
    return session;
  }

  async removeSession(sessionId: string): Promise<void> {
    const sessions = await this.getSessions(undefined);
    const removed = sessions.find((s) => s.id === sessionId);
    await this.secrets.deleteToken();
    if (removed) {
      this._onDidChangeSessions.fire({ added: [], changed: [], removed: [removed] });
    }
  }

  private async _mockSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
    await this.secrets.storeToken(MOCK_TOKEN);
    const session: vscode.AuthenticationSession = {
      id: SESSION_ID,
      accessToken: MOCK_TOKEN,
      account: decodeAccount(MOCK_TOKEN),
      scopes: Array.from(scopes),
    };
    this._onDidChangeSessions.fire({ added: [session], changed: [], removed: [] });
    return session;
  }
}
