export { initParser, parseDocument, applyDocumentEdits, invalidateDocument, getSupportedLanguages, getLanguage } from "./parser";

import { pythonRules } from "./rules/python";
import { javascriptRules } from "./rules/javascript";
import { typescriptRules } from "./rules/typescript";
import { javaRules } from "./rules/java";
import { cRules } from "./rules/c";

export type Query = {
  id: string;
  description: string;
  severity: "error" | "warning" | "info";
  pattern: string;
  message: string;
  conceptId: string;
};

export type RuleSet = {
  language: string;
  queries: Query[];
};

export const ALL_RULE_SETS: RuleSet[] = [
  pythonRules,
  javascriptRules,
  typescriptRules,
  javaRules,
  cRules,
];

export const RULES_BY_LANGUAGE = new Map<string, RuleSet>(
  ALL_RULE_SETS.map((rs) => [rs.language, rs]),
);
