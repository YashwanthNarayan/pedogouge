import type { RuleSet } from "../index";

export const javascriptRules: RuleSet = {
  language: "javascript",
  queries: [
    {
      id: "js-loose-eq",
      description: "== instead of === (loose equality ignores type)",
      severity: "warning",
      // Matches any binary expression with == operator
      pattern: `(binary_expression operator: "==" @op) @match`,
      message: "Use === (strict equality) instead of ==. Loose equality performs type coercion and can produce surprising results.",
      conceptId: "js-equality",
    },
    {
      id: "js-var-decl",
      description: "var declaration — use let or const instead",
      severity: "warning",
      // In tree-sitter-javascript, var uses variable_declaration; let/const use lexical_declaration
      pattern: `(variable_declaration) @match`,
      message: "Prefer 'const' or 'let' over 'var'. var is function-scoped and hoisted, which can cause subtle bugs.",
      conceptId: "js-variable-scope",
    },
    {
      id: "js-typeof-null",
      description: "typeof null === 'object' — historical JavaScript bug",
      severity: "info",
      // Matches: typeof <expr> === "object" (the null check antipattern)
      pattern: `
        (binary_expression
          operator: "==="
          left: (unary_expression operator: "typeof")
          right: (string)) @match
      `,
      message: "'typeof null' returns \"object\" — a known JavaScript quirk. Add an explicit null check if you need one.",
      conceptId: "js-typeof",
    },
    {
      id: "js-promise-no-await",
      description: "new Promise() wrapping an async function — Promise constructor antipattern",
      severity: "warning",
      // Matches: new Promise(...)
      pattern: `
        (new_expression
          constructor: (identifier) @_ctor
          (#eq? @_ctor "Promise")) @match
      `,
      message: "Avoid wrapping async code in 'new Promise()'. Use async/await or chain .then()/.catch() instead.",
      conceptId: "js-promises",
    },
  ],
};
