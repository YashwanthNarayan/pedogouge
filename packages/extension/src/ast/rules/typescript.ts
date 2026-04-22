import type { RuleSet } from "../index";

export const typescriptRules: RuleSet = {
  language: "typescript",
  queries: [
    {
      id: "ts-loose-eq",
      description: "== instead of === in TypeScript",
      severity: "warning",
      pattern: `(binary_expression operator: "==" @op) @match`,
      message: "Use === (strict equality). TypeScript's type system makes loose == even more error-prone.",
      conceptId: "ts-equality",
    },
    {
      id: "ts-any-type",
      description: "Explicit 'any' type annotation defeats TypeScript's type safety",
      severity: "warning",
      // In tree-sitter-typescript, 'any' is a predefined_type
      pattern: `(predefined_type "any") @match`,
      message: "Avoid 'any' — it opts out of type checking. Use 'unknown' if the type is truly unknown, or a proper union type.",
      conceptId: "ts-type-safety",
    },
    {
      id: "ts-non-null-assertion",
      description: "Non-null assertion (!) suppresses null checks",
      severity: "info",
      // Matches expr!
      pattern: `(non_null_expression) @match`,
      message: "The ! non-null assertion tells TypeScript to ignore null/undefined. Add a runtime null check instead.",
      conceptId: "ts-null-safety",
    },
    {
      id: "ts-type-assertion",
      description: "Type assertion (as Type) bypasses type checking",
      severity: "info",
      // Matches: expr as Type
      pattern: `(as_expression) @match`,
      message: "Type assertions bypass TypeScript's checks. Consider using type guards or narrowing instead of 'as'.",
      conceptId: "ts-type-guards",
    },
  ],
};
