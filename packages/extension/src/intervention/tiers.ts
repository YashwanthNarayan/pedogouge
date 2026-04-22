import * as vscode from "vscode";
import { BackendClient } from "../backend/client";
import type { InterventionDecision } from "./panels";
import { openMicroLessonPanel, openRegressionPanel } from "./panels";

export type { InterventionDecision };

export async function handleIntervention(
  decision: InterventionDecision,
  context: vscode.ExtensionContext,
  _backendClient: BackendClient,
): Promise<void> {
  switch (decision.tier) {
    case 1:
      // Already handled by PtyNarrator (showInformationMessage) — no-op here
      break;

    case 2: {
      const choice = await vscode.window.showWarningMessage(
        decision.contentMd,
        "Open Lesson",
        "Dismiss",
      );
      if (choice === "Open Lesson") {
        void vscode.commands.executeCommand("pedagogue.openLesson", decision.conceptId);
      }
      break;
    }

    case 3:
      openMicroLessonPanel(decision, context);
      break;

    case 4:
      // Handled by TutorDebugTracker — log only
      console.log(`[TutorIntervention] tier 4 for ${decision.conceptId} — DAP tracker owns this`);
      break;

    case 5:
      openRegressionPanel(decision, context);
      break;
  }
}
