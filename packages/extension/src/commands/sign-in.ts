import * as vscode from "vscode";
import { PedagogueAuthProvider } from "../auth/provider";

export async function executeSignIn(provider: PedagogueAuthProvider): Promise<void> {
  try {
    if (process.env.PEDAGOGUE_MOCK_AUTH === "true") {
      await provider.createSession([]);
      vscode.window.showInformationMessage("Pedagogue: Signed in (mock mode)");
      return;
    }
    await vscode.authentication.getSession(PedagogueAuthProvider.PROVIDER_ID, [], {
      createIfNone: true,
    });
    vscode.window.showInformationMessage("Pedagogue: Signed in successfully");
  } catch (err) {
    vscode.window.showErrorMessage(`Pedagogue: Sign-in failed — ${(err as Error).message}`);
  }
}
