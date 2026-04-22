import * as vscode from "vscode";
import type { ConceptNode } from "@pedagogue/shared";
import { parseDocument } from "../ast/parser";
import type Parser from "web-tree-sitter";

// Node types that warrant a lesson CodeLens — covers Python and JS/TS variants
const TARGET_TYPES = new Set([
  "function_definition",
  "class_definition",
  "function_declaration",
  "class_declaration",
  "method_definition",
  "arrow_function",
  "for_statement",
  "while_statement",
  "if_statement",
]);

export class TutorCodeLensProvider implements vscode.CodeLensProvider {
  constructor(private readonly _getConceptGraph: () => ConceptNode[]) {}

  provideCodeLenses(
    doc: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    const tree = parseDocument(doc);
    if (!tree) return [];

    const graph = this._getConceptGraph();
    if (graph.length === 0) return [];

    const lenses: vscode.CodeLens[] = [];

    _walkTree(tree.rootNode, 0, (node) => {
      if (!TARGET_TYPES.has(node.type)) return;

      const text = node.text.toLowerCase();
      const concept = graph.find((c) => text.includes(c.name.toLowerCase()));
      if (!concept) return;

      const pos   = new vscode.Position(node.startPosition.row, 0);
      const range = new vscode.Range(pos, pos);
      lenses.push(
        new vscode.CodeLens(range, {
          title: `📖 Lesson: ${concept.name} (mastery: ${Math.round(concept.masteryScore * 100)}%)`,
          command: "pedagogue.openLesson",
          arguments: [concept.id],
        }),
      );
    });

    return lenses;
  }
}

function _walkTree(
  node: Parser.SyntaxNode,
  depth: number,
  visit: (n: Parser.SyntaxNode) => void,
): void {
  if (depth > 3) return;
  visit(node);
  for (const child of node.children) {
    _walkTree(child, depth + 1, visit);
  }
}
