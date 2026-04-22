import type { RuleSet } from "../index";

export const cRules: RuleSet = {
  language: "c",
  queries: [
    {
      id: "c-strcpy",
      description: "strcpy is unbounded — use strncpy or strlcpy",
      severity: "error",
      // Matches any call to strcpy(...)
      pattern: `
        (call_expression
          function: (identifier) @fn
          (#eq? @fn "strcpy")) @match
      `,
      message: "strcpy() has no bounds check and causes buffer overflows. Use strncpy(dst, src, sizeof(dst)-1) instead.",
      conceptId: "c-buffer-safety",
    },
    {
      id: "c-scanf-no-width",
      description: "scanf %s without width limit is unbounded",
      severity: "error",
      // Matches any call to scanf — post-filter for %s without width in format string
      pattern: `
        (call_expression
          function: (identifier) @fn
          (#eq? @fn "scanf")) @match
      `,
      message: "scanf(\"%s\", ...) reads unlimited characters. Specify a width limit, e.g. \"%63s\", to prevent buffer overflow.",
      conceptId: "c-input-validation",
    },
    {
      id: "c-return-local-addr",
      description: "Returning address of a local variable — undefined behavior after function returns",
      severity: "error",
      // Matches: return &local_var
      pattern: `
        (return_statement
          (unary_expression
            operator: "&"
            argument: (identifier) @local)) @match
      `,
      message: "Returning &local_var causes undefined behavior — the stack frame is gone after the function returns.",
      conceptId: "c-memory-lifetime",
    },
    {
      id: "c-gets",
      description: "gets() is removed in C11 — always unsafe",
      severity: "error",
      // Matches any call to gets(...)
      pattern: `
        (call_expression
          function: (identifier) @fn
          (#eq? @fn "gets")) @match
      `,
      message: "gets() was removed in C11 because it is inherently unsafe. Use fgets(buf, sizeof(buf), stdin) instead.",
      conceptId: "c-buffer-safety",
    },
  ],
};
