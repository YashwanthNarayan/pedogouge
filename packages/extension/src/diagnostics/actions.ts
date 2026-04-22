import * as vscode from "vscode";
import { ALL_RULE_SETS } from "../ast";
import type { Query as TutorQuery } from "../ast";

const RULES_BY_ID = new Map<string, TutorQuery>(
  ALL_RULE_SETS.flatMap((rs) => rs.queries.map((q) => [q.id, q])),
);

const SUPPORTED_LANGUAGES = ["python", "javascript", "typescript", "typescriptreact", "java", "c"];

function getBackendUrl(): string {
  return (
    vscode.workspace.getConfiguration("pedagogue").get<string>("backendUrl") ?? "https://pedagogue.app"
  ).replace(/\/$/, "");
}

class TutorCodeActionsProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    _doc: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diag of context.diagnostics) {
      if (diag.source !== "tutor") continue;

      const rule = RULES_BY_ID.get(diag.code as string);
      if (!rule) continue;

      // Action 1: ask @tutor to explain this diagnostic
      const explainAction = new vscode.CodeAction(
        "Ask @tutor to explain this",
        vscode.CodeActionKind.QuickFix,
      );
      explainAction.diagnostics = [diag];
      explainAction.command = {
        command: "workbench.action.chat.open",
        title: "Ask @tutor to explain this",
        arguments: [{ query: `@tutor /explain ${rule.id}: ${diag.message}` }],
      };

      // Action 2: open the concept lesson in the browser
      const lessonUrl = `${getBackendUrl()}/lesson/${rule.conceptId}`;
      const lessonAction = new vscode.CodeAction(
        `Open lesson: ${rule.conceptId}`,
        vscode.CodeActionKind.Empty,
      );
      lessonAction.diagnostics = [diag];
      lessonAction.command = {
        command: "vscode.open",
        title: `Open lesson: ${rule.conceptId}`,
        arguments: [vscode.Uri.parse(lessonUrl)],
      };

      actions.push(explainAction, lessonAction);
    }

    return actions;
  }
}

export function registerCodeActionsProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      SUPPORTED_LANGUAGES,
      new TutorCodeActionsProvider(),
      {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.Empty],
      },
    ),
  );
}
