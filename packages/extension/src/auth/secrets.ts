import type * as vscode from "vscode";

export type PendingAuthData = {
  verifier: string;
  createdAt: number;
};

const TOKEN_KEY = "pedagogue.sessionToken";
const PENDING_PREFIX = "auth:pending:";

export class SecretStore {
  constructor(private readonly store: vscode.SecretStorage) {}

  async getToken(): Promise<string | undefined> {
    return this.store.get(TOKEN_KEY);
  }

  async storeToken(token: string): Promise<void> {
    await this.store.store(TOKEN_KEY, token);
  }

  async deleteToken(): Promise<void> {
    await this.store.delete(TOKEN_KEY);
  }

  async getPending(state: string): Promise<PendingAuthData | undefined> {
    const raw = await this.store.get(`${PENDING_PREFIX}${state}`);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as PendingAuthData;
    } catch {
      return undefined;
    }
  }

  async storePending(state: string, data: PendingAuthData): Promise<void> {
    await this.store.store(`${PENDING_PREFIX}${state}`, JSON.stringify(data));
  }

  async deletePending(state: string): Promise<void> {
    await this.store.delete(`${PENDING_PREFIX}${state}`);
  }
}
