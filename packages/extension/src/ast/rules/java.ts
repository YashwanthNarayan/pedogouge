import type { RuleSet } from "../index";

export const javaRules: RuleSet = {
  language: "java",
  queries: [
    {
      id: "java-string-eq",
      description: "== on objects compares references, not values",
      severity: "error",
      // Matches any == binary expression — post-filter for String operands
      pattern: `
        (binary_expression
          operator: "=="
          left: (_) @left
          right: (_) @right) @match
      `,
      message: "Use .equals() to compare String values. == compares object references, not content.",
      conceptId: "java-equality",
    },
    {
      id: "java-empty-catch",
      description: "Empty catch block silently swallows exceptions",
      severity: "error",
      // Matches a catch clause whose body block has no statements
      pattern: `
        (catch_clause
          body: (block) @body) @match
      `,
      message: "Empty catch block hides errors. At minimum, log the exception or re-throw it.",
      conceptId: "java-exception-handling",
    },
    {
      id: "java-raw-collection",
      description: "Raw generic type — missing type parameter",
      severity: "warning",
      // Matches: new ArrayList() / new HashMap() without type args
      pattern: `
        (object_creation_expression
          type: (type_identifier) @type
          arguments: (argument_list)
          (#match? @type "^(ArrayList|HashMap|HashSet|LinkedList|TreeMap|LinkedHashMap)$")) @match
      `,
      message: "Use parameterized types (e.g. ArrayList<String>) to catch type errors at compile time.",
      conceptId: "java-generics",
    },
    {
      id: "java-null-eq",
      description: "Null check with == may cause NullPointerException if order is wrong",
      severity: "info",
      // Matches: expr == null
      pattern: `
        (binary_expression
          operator: "=="
          right: (null_literal)) @match
      `,
      message: "Put the null literal on the left (null == expr) to avoid NPE, or use Objects.isNull().",
      conceptId: "java-null-safety",
    },
  ],
};
