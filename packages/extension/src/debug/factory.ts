import * as vscode from "vscode";
import { BackendClient } from "../backend/client";
import { TutorDebugTracker } from "./tracker";

// Only activate for languages we teach
const SUPPORTED_TYPES = new Set(["python", "node", "java", "cppdbg"]);

export class TutorDebugTrackerFactory implements vscode.DebugAdapterTrackerFactory {
  constructor(
    private readonly _client: BackendClient,
    private readonly _outputChannel: vscode.OutputChannel,
    private readonly _getSessionId: () => string | undefined,
  ) {}

  createDebugAdapterTracker(
    session: vscode.DebugSession,
  ): vscode.ProviderResult<vscode.DebugAdapterTracker> {
    if (!SUPPORTED_TYPES.has(session.type)) return undefined;
    return new TutorDebugTracker(session, this._client, this._outputChannel, this._getSessionId);
  }
}
