import * as vscode from "vscode";
import { BackendClient } from "../backend/client";

// Shape returned by GET /api/lessons/:conceptId
type LessonResponse = {
  conceptId: string;
  bodyMd: string;
  starterCode?: string;
  citations?: Array<{ id: string; source: string; excerpt: string }>;
};

// Registered in package.json contributes.notebooks
const NOTEBOOK_TYPE = "tutor-lesson";

export async function openLesson(
  _context: vscode.ExtensionContext,
  client: BackendClient,
  conceptId: string,
  sessionId?: string,
): Promise<void> {
  if (!conceptId) {
    void vscode.window.showWarningMessage("No concept ID provided for lesson.");
    return;
  }

  const path = sessionId
    ? `/api/lessons/${encodeURIComponent(conceptId)}?sessionId=${encodeURIComponent(sessionId)}`
    : `/api/lessons/${encodeURIComponent(conceptId)}`;

  let lesson: LessonResponse;
  try {
    lesson = await client.request<LessonResponse>(path);
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Failed to load lesson for "${conceptId}": ${(err as Error).message}`,
    );
    return;
  }

  const cells = _parseLessonCells(lesson.bodyMd, lesson.starterCode);

  let notebook: vscode.NotebookDocument;
  try {
    notebook = await vscode.workspace.openNotebookDocument(NOTEBOOK_TYPE, {
      cells,
      metadata: { conceptId: lesson.conceptId },
    });
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Failed to open lesson notebook: ${(err as Error).message}`,
    );
    return;
  }

  await vscode.window.showNotebookDocument(notebook, {
    viewColumn: vscode.ViewColumn.Beside,
    preserveFocus: true,
  });
}

function _parseLessonCells(
  bodyMd: string,
  starterCode?: string,
): vscode.NotebookCellData[] {
  const sections = bodyMd.split(/\n---\n/);

  if (sections.length <= 1) {
    // No dividers: one markdown cell + optional starter code cell
    const cells: vscode.NotebookCellData[] = [
      new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, bodyMd.trim(), "markdown"),
    ];
    if (starterCode) {
      cells.push(
        new vscode.NotebookCellData(vscode.NotebookCellKind.Code, starterCode.trim(), "python"),
      );
    } else {
      cells.push(
        new vscode.NotebookCellData(vscode.NotebookCellKind.Code, "# Try it here\n", "python"),
      );
    }
    return cells;
  }

  return sections.map((section): vscode.NotebookCellData => {
    const trimmed    = section.trim();
    const fenceMatch = trimmed.match(/^```(\w*)\n([\s\S]*?)\n?```$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || "python";
      const code = fenceMatch[2] ?? "";
      return new vscode.NotebookCellData(vscode.NotebookCellKind.Code, code, lang);
    }
    return new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, trimmed, "markdown");
  });
}
