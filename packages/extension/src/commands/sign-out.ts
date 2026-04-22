import * as vscode from "vscode";
import { PedagogueAuthProvider } from "../auth/provider";

export async function executeSignOut(provider: PedagogueAuthProvider): Promise<void> {
  const sessions = await provider.getSessions(undefined);
  if (sessions.length === 0) {
    vscode.window.showInformationMessage("Pedagogue: Not currently signed in");
    return;
  }
  for (const session of sessions) {
    await provider.removeSession(session.id);
  }
  vscode.window.showInformationMessage("Pedagogue: Signed out");
}
