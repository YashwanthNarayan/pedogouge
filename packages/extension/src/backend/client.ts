import * as vscode from "vscode";

function getBackendUrl(): string {
  const config = vscode.workspace.getConfiguration("pedagogue");
  return (config.get<string>("backendUrl") ?? "https://pedagogue.app").replace(/\/$/, "");
}

async function getSessionToken(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get("pedagogue.sessionToken");
}

export type BackendRequestInit = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

export class BackendClient {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async request<T>(path: string, init: BackendRequestInit = {}): Promise<T> {
    const token = await getSessionToken(this.secrets);
    const url = `${getBackendUrl()}${path}`;

    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });

    if (res.status === 401) {
      throw Object.assign(new Error("Unauthorized"), { status: 401 });
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after") ?? "60";
      throw Object.assign(new Error("Rate limited"), { status: 429, retryAfter: parseInt(retryAfter, 10) });
    }
    if (!res.ok) {
      throw Object.assign(new Error(`Backend error ${res.status}`), { status: res.status });
    }

    return res.json() as Promise<T>;
  }

  async *streamSSE(path: string, body: unknown, signal?: AbortSignal): AsyncGenerator<string> {
    const token = await getSessionToken(this.secrets);
    const url = `${getBackendUrl()}${path}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });

    if (res.status === 401) throw Object.assign(new Error("Unauthorized"), { status: 401 });
    if (res.status === 429) throw Object.assign(new Error("Rate limited"), { status: 429 });
    if (!res.ok) throw Object.assign(new Error(`Backend error ${res.status}`), { status: res.status });
    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") return;
            yield data;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
