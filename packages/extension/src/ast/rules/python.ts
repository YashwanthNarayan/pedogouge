import type { RuleSet } from "../index";

export const pythonRules: RuleSet = {
  language: "python",
  queries: [
    {
      id: "py-range-len",
      description: "for x in range(len(y)) — use enumerate() instead",
      severity: "warning",
      // Matches: for _ in range(len(_))
      pattern: `
        (for_statement
          right: (call
            function: (identifier) @_range
            arguments: (argument_list
              (call
                function: (identifier) @_len)))
          (#eq? @_range "range")
          (#eq? @_len "len")) @match
      `,
      message: "Use enumerate(y) instead of range(len(y)) — it's more Pythonic and avoids off-by-one errors.",
      conceptId: "py-iteration-patterns",
    },
    {
      id: "py-mutable-default",
      description: "Mutable default argument (list or dict) — shared across all calls",
      severity: "error",
      // Matches: def f(x=[]) or def f(x={})
      pattern: `
        (default_parameter
          value: [(list) (dictionary)] @mutable) @match
      `,
      message: "Mutable default argument is shared across all calls. Use None and assign inside the function.",
      conceptId: "py-function-defaults",
    },
    {
      id: "py-bare-except",
      description: "Bare except: clause catches everything including KeyboardInterrupt",
      severity: "warning",
      // Matches only bare `except:` — except_clause with no value field (no exception type)
      pattern: `(except_clause !value) @match`,
      message: "Bare 'except:' catches all exceptions. Specify the exception type (e.g. 'except ValueError:').",
      conceptId: "py-exception-handling",
    },
    {
      id: "py-eq-none",
      description: "== None comparison — use 'is None' instead",
      severity: "warning",
      // Matches `x == None` only — operators: "==" excludes `is` and `is not`
      pattern: `
        (comparison_operator
          operators: "=="
          (none)) @match
      `,
      message: "Use 'is None' (identity check) instead of '== None' (equality check).",
      conceptId: "py-identity-equality",
    },
  ],
};
