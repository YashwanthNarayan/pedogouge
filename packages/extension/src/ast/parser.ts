import Parser from "web-tree-sitter";
import * as path from "path";
import * as vscode from "vscode";

// Maps VS Code languageId → WASM filename bundled in dist/grammars/
const LANG_WASM: Record<string, string> = {
  python: "tree-sitter-python.wasm",
  javascript: "tree-sitter-javascript.wasm",
  typescript: "tree-sitter-typescript.wasm",
  typescriptreact: "tree-sitter-typescript.wasm",
  java: "tree-sitter-java.wasm",
  c: "tree-sitter-c.wasm",
};

let _initialized = false;
const _parsers = new Map<string, Parser>();
const _languages = new Map<string, Parser.Language>();
// Per-document trees enable incremental re-parsing (tree.edit + parser.parse)
const _trees = new Map<string, Parser.Tree>();

export async function initParser(context: vscode.ExtensionContext): Promise<void> {
  if (_initialized) return;

  const grammarsPath = path.join(context.extensionPath, "dist", "grammars");

  await Parser.init({
    locateFile(scriptName: string) {
      return path.join(grammarsPath, scriptName);
    },
  });

  await Promise.all(
    Object.entries(LANG_WASM).map(async ([lang, file]) => {
      if (_languages.has(lang)) return; // deduplicate (e.g. tsx → same WASM as ts)
      try {
        const language = await Parser.Language.load(path.join(grammarsPath, file));
        _languages.set(lang, language);
      } catch {
        // WASM not present — feature silently unavailable for this language
      }
    }),
  );

  _initialized = true;
}

export function parseDocument(doc: vscode.TextDocument): Parser.Tree | undefined {
  const language = _languages.get(doc.languageId);
  if (!language) return undefined;

  let parser = _parsers.get(doc.languageId);
  if (!parser) {
    parser = new Parser();
    parser.setLanguage(language);
    _parsers.set(doc.languageId, parser);
  }

  const oldTree = _trees.get(doc.uri.toString());
  const tree = parser.parse(doc.getText(), oldTree);
  if (tree) _trees.set(doc.uri.toString(), tree);
  return tree ?? undefined;
}

// Must be called before re-parsing on a change event.
// Applies all VS Code content changes as tree-sitter edits on the cached tree
// so the next parseDocument() can do a true incremental re-parse.
export function applyDocumentEdits(
  doc: vscode.TextDocument,
  changes: readonly vscode.TextDocumentContentChangeEvent[],
): void {
  const tree = _trees.get(doc.uri.toString());
  if (!tree) return;

  for (const change of changes) {
    const startPos = { row: change.range.start.line, column: change.range.start.character };
    const oldEndPos = { row: change.range.end.line, column: change.range.end.character };
    tree.edit({
      startIndex: change.rangeOffset,
      oldEndIndex: change.rangeOffset + change.rangeLength,
      newEndIndex: change.rangeOffset + change.text.length,
      startPosition: startPos,
      oldEndPosition: oldEndPos,
      newEndPosition: advancePosition(startPos, change.text),
    });
  }
}

export function invalidateDocument(uri: string): void {
  const tree = _trees.get(uri);
  if (tree) {
    tree.delete();
    _trees.delete(uri);
  }
}

export function getLanguage(langId: string): Parser.Language | undefined {
  return _languages.get(langId);
}

export function getSupportedLanguages(): string[] {
  return [...new Set(Object.keys(LANG_WASM).filter((l) => _languages.has(l)))];
}

function advancePosition(
  start: { row: number; column: number },
  text: string,
): { row: number; column: number } {
  const lines = text.split("\n");
  if (lines.length === 1) return { row: start.row, column: start.column + text.length };
  // lines.length > 1 guaranteed by the early return above
  return { row: start.row + lines.length - 1, column: lines[lines.length - 1]!.length };
}
