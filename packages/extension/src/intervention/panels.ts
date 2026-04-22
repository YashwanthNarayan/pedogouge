import * as vscode from "vscode";
import { randomBytes } from "crypto";

export type InterventionDecision = {
  tier: 1 | 2 | 3 | 4 | 5;
  conceptId: string;
  contentMd: string;
  deliveryChannel: string;
};

// Converts a small subset of Markdown to safe HTML (no external deps needed)
function _mdToHtml(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

function _buildHtml(
  nonce: string,
  title: string,
  contentHtml: string,
  conceptId: string,
): string {
  const safeConceptId = conceptId.replace(/['"<>&]/g, "");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src wss://*.supabase.co;">
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px 24px;
      line-height: 1.6;
    }
    h1, h2, h3 { color: var(--vscode-editor-foreground); margin-top: 0; }
    code {
      font-family: var(--vscode-editor-font-family, monospace);
      background: var(--vscode-textBlockQuote-background);
      padding: 2px 5px;
      border-radius: 3px;
    }
    .content { margin-bottom: 24px; }
    .buttons { display: flex; gap: 10px; margin-top: 20px; }
    button {
      padding: 7px 16px;
      border-radius: 4px;
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
      font-size: 13px;
    }
    #btn-dismiss {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    #btn-dismiss:hover { background: var(--vscode-button-hoverBackground); }
    #btn-lesson {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    #btn-lesson:hover { background: var(--vscode-button-secondaryHoverBackground); }
  </style>
</head>
<body>
  <h2>${title}</h2>
  <div class="content"><p>${contentHtml}</p></div>
  <div class="buttons">
    <button id="btn-dismiss">Got it — continue</button>
    <button id="btn-lesson">📖 Open full lesson</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const conceptId = ${JSON.stringify(safeConceptId)};
    document.getElementById('btn-dismiss').onclick = () =>
      vscode.postMessage({ command: 'dismiss' });
    document.getElementById('btn-lesson').onclick = () =>
      vscode.postMessage({ command: 'openLesson', conceptId });
  </script>
</body>
</html>`;
}

function _createInterventionPanel(
  title: string,
  decision: InterventionDecision,
  context: vscode.ExtensionContext,
  viewColumn: vscode.ViewColumn,
): vscode.WebviewPanel {
  const nonce = randomBytes(16).toString("hex");

  const panel = vscode.window.createWebviewPanel(
    "pedagogue.intervention",
    title,
    viewColumn,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
      localResourceRoots: [context.extensionUri],
    },
  );

  panel.webview.html = _buildHtml(
    nonce,
    title,
    _mdToHtml(decision.contentMd),
    decision.conceptId,
  );

  panel.webview.onDidReceiveMessage(
    (message: { command: string; conceptId?: string }) => {
      if (message.command === "dismiss") {
        panel.dispose();
      } else if (message.command === "openLesson") {
        void vscode.commands.executeCommand("pedagogue.openLesson", message.conceptId);
        panel.dispose();
      }
    },
    undefined,
    context.subscriptions,
  );

  return panel;
}

export function openMicroLessonPanel(
  decision: InterventionDecision,
  context: vscode.ExtensionContext,
): void {
  _createInterventionPanel(
    `💡 Micro-lesson: ${decision.conceptId}`,
    decision,
    context,
    vscode.ViewColumn.Beside,
  );
}

export function openRegressionPanel(
  decision: InterventionDecision,
  context: vscode.ExtensionContext,
): void {
  _createInterventionPanel(
    `🔁 Let's revisit: ${decision.conceptId}`,
    decision,
    context,
    vscode.ViewColumn.Active,
  );
}
