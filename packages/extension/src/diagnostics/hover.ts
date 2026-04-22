import * as vscode from "vscode";
import { ALL_RULE_SETS } from "../ast";
import type { Query as TutorQuery } from "../ast";

// Flat rule lookup by id — used to resolve rule details from a diagnostic code
const RULES_BY_ID = new Map<string, TutorQuery>(
  ALL_RULE_SETS.flatMap((rs) => rs.queries.map((q) => [q.id, q])),
);

const SUPPORTED_LANGUAGES = ["python", "javascript", "typescript", "typescriptreact", "java", "c"];

function getBackendUrl(): string {
  return (
    vscode.workspace.getConfiguration("pedagogue").get<string>("backendUrl") ?? "https://pedagogue.app"
  ).replace(/\/$/, "");
}

export function registerHoverProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(SUPPORTED_LANGUAGES, {
      provideHover(doc, position) {
        // Only surface our own diagnostics
        const tutorDiags = vscode.languages.getDiagnostics(doc.uri).filter(
          (d) => d.source === "tutor" && d.range.contains(position),
        );
        if (tutorDiags.length === 0) return undefined;

        const md = new vscode.MarkdownString("", true);
        md.isTrusted = true;
        md.supportHtml = false;

        for (const diag of tutorDiags) {
          const rule = RULES_BY_ID.get(diag.code as string);
          if (!rule) continue;

          const lessonUrl = `${getBackendUrl()}/lesson/${rule.conceptId}`;

          md.appendMarkdown(`**@tutor** — \`${rule.id}\`\n\n`);
          md.appendMarkdown(`${diag.message}\n\n`);
          md.appendMarkdown(`[Open lesson: ${rule.conceptId}](${lessonUrl})`);

          // Separator between multiple diagnostics at same position
          if (tutorDiags.indexOf(diag) < tutorDiags.length - 1) {
            md.appendMarkdown("\n\n---\n\n");
          }
        }

        return new vscode.Hover(md);
      },
    }),
  );
}
