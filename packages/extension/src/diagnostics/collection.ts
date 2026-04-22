import * as vscode from "vscode";
import type Parser from "web-tree-sitter";
import { parseDocument, getLanguage } from "../ast/parser";
import { RULES_BY_LANGUAGE } from "../ast";

// Single shared collection — source: "tutor", code: rule.id on each diagnostic
export const tutorCollection = vscode.languages.createDiagnosticCollection("tutor");

// Compiled Parser.Query objects are expensive; cache keyed by "langId:ruleId"
const _queryCache = new Map<string, Parser.Query>();

const SEVERITY_MAP: Record<string, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};

// Normalize languageId for rule lookup (typescriptreact shares typescript rules)
function normalizeId(langId: string): string {
  return langId === "typescriptreact" ? "typescript" : langId;
}

export function runDiagnostics(doc: vscode.TextDocument): void {
  const ruleSet = RULES_BY_LANGUAGE.get(normalizeId(doc.languageId));
  if (!ruleSet) {
    tutorCollection.delete(doc.uri);
    return;
  }

  const tree = parseDocument(doc);
  if (!tree) {
    // Parser not yet initialised or language not supported — leave stale diagnostics
    return;
  }

  const language = getLanguage(doc.languageId) ?? getLanguage(normalizeId(doc.languageId));
  if (!language) return;

  const diagnostics: vscode.Diagnostic[] = [];

  for (const rule of ruleSet.queries) {
    const cacheKey = `${normalizeId(doc.languageId)}:${rule.id}`;
    let q = _queryCache.get(cacheKey);

    if (!q) {
      try {
        q = language.query(rule.pattern);
        _queryCache.set(cacheKey, q);
      } catch {
        // Malformed S-expression — skip this rule silently
        continue;
      }
    }

    let matches: Parser.QueryMatch[];
    try {
      matches = q.matches(tree.rootNode);
    } catch {
      continue;
    }

    for (const match of matches) {
      // Every rule must place @match on the primary node to report
      const capture = match.captures.find((c) => c.name === "match");
      if (!capture) continue;

      const { startPosition: sp, endPosition: ep } = capture.node;
      const range = new vscode.Range(
        new vscode.Position(sp.row, sp.column),
        new vscode.Position(ep.row, ep.column),
      );

      const diag = new vscode.Diagnostic(range, rule.message, SEVERITY_MAP[rule.severity]);
      diag.source = "tutor";
      diag.code = rule.id;
      diagnostics.push(diag);
    }
  }

  tutorCollection.set(doc.uri, diagnostics);
}

export function clearDiagnostics(uri: vscode.Uri): void {
  tutorCollection.delete(uri);
}
