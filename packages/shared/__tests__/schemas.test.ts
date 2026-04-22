import { describe, it, expect } from "vitest";
import { ProjectBlueprint } from "../src/schemas/project-blueprint.js";
import { ConceptNode } from "../src/schemas/concept-node.js";
import { ASTDiagnostic } from "../src/schemas/ast-diagnostic.js";
import { InterventionDecision } from "../src/schemas/intervention-decision.js";
import { InterviewContext } from "../src/schemas/interview-context.js";
import { VerifiableCredentialSubject } from "../src/schemas/verifiable-credential-subject.js";
import { Channels } from "../src/channels.js";
import { EventKind, EventPayload } from "../src/events.js";

// ---------------------------------------------------------------------------
// ProjectBlueprint
// ---------------------------------------------------------------------------
const validBlueprint: ProjectBlueprint = {
  title: "Habit Tracker",
  summary: "Track daily habits with streaks",
  features: [
    {
      id: "f1",
      name: "Add Habit",
      userStory: "As a user I can add a habit",
      acceptanceCriteria: ["Habit is persisted", "Name is required"],
      complexity: "easy",
      conceptIds: ["concept_loops", "concept_lists"],
    },
  ],
  dataModels: [{ name: "Habit", fields: [{ name: "name", type: "string" }] }],
  apiSurface: [{ method: "POST", path: "/habits", purpose: "Create habit" }],
  conceptGraph: [
    { id: "concept_loops", name: "Loops", prerequisites: [], estimatedMinutes: 30 },
  ],
  scopedMvp: ["f1"],
  ambiguities: [],
  recommendedLanguage: "python",
  starterRepo: { files: [{ path: "main.py", content: "# main" }], testCmd: "pytest" },
};

describe("ProjectBlueprint", () => {
  it("parses a valid blueprint", () => {
    expect(ProjectBlueprint.parse(validBlueprint)).toEqual(validBlueprint);
  });

  it("roundtrips: parse(parse(x)) === parse(x)", () => {
    const first = ProjectBlueprint.parse(validBlueprint);
    const second = ProjectBlueprint.parse(first);
    expect(second).toEqual(first);
  });

  it("rejects missing title", () => {
    const { title: _t, ...rest } = validBlueprint;
    expect(ProjectBlueprint.safeParse(rest).success).toBe(false);
  });

  it("rejects summary over 400 chars", () => {
    expect(
      ProjectBlueprint.safeParse({ ...validBlueprint, summary: "x".repeat(401) }).success,
    ).toBe(false);
  });

  it("rejects invalid recommendedLanguage", () => {
    expect(
      ProjectBlueprint.safeParse({ ...validBlueprint, recommendedLanguage: "ruby" }).success,
    ).toBe(false);
  });

  it("rejects invalid complexity enum", () => {
    const bad = {
      ...validBlueprint,
      features: [{ ...validBlueprint.features[0], complexity: "impossible" }],
    };
    expect(ProjectBlueprint.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ConceptNode
// ---------------------------------------------------------------------------
const validNode: ConceptNode = {
  id: "concept_loops",
  name: "Loops",
  prerequisites: ["concept_variables"],
  masteryScore: 0.75,
  decayRate: 0.1,
  lastTestedAt: "2026-04-21T10:00:00Z",
  relatedErrors: ["IndexError"],
  strugglePattern: "none",
};

describe("ConceptNode", () => {
  it("parses a valid node", () => {
    expect(ConceptNode.parse(validNode)).toEqual(validNode);
  });

  it("roundtrips", () => {
    expect(ConceptNode.parse(ConceptNode.parse(validNode))).toEqual(ConceptNode.parse(validNode));
  });

  it("accepts null lastTestedAt", () => {
    expect(ConceptNode.parse({ ...validNode, lastTestedAt: null }).lastTestedAt).toBeNull();
  });

  it("rejects masteryScore > 1", () => {
    expect(ConceptNode.safeParse({ ...validNode, masteryScore: 1.1 }).success).toBe(false);
  });

  it("rejects masteryScore < 0", () => {
    expect(ConceptNode.safeParse({ ...validNode, masteryScore: -0.1 }).success).toBe(false);
  });

  it("rejects invalid strugglePattern", () => {
    expect(
      ConceptNode.safeParse({ ...validNode, strugglePattern: "panic" }).success,
    ).toBe(false);
  });

  it("accepts all valid struggle patterns", () => {
    for (const p of ["none", "conceptual_gap", "integration", "surface_fix"] as const) {
      expect(ConceptNode.parse({ ...validNode, strugglePattern: p }).strugglePattern).toBe(p);
    }
  });
});

// ---------------------------------------------------------------------------
// ASTDiagnostic
// ---------------------------------------------------------------------------
const validDiag: ASTDiagnostic = {
  ruleId: "py_for_in_len",
  file: "main.py",
  line: 14,
  column: 4,
  severity: "warning",
  message: "Did you mean range(len(x))?",
  conceptId: "concept_range_vs_len",
  lessonLink: "https://pedagogue.app/lesson/concept_range_vs_len",
};

describe("ASTDiagnostic", () => {
  it("parses a valid diagnostic", () => {
    expect(ASTDiagnostic.parse(validDiag)).toEqual(validDiag);
  });

  it("roundtrips", () => {
    expect(ASTDiagnostic.parse(ASTDiagnostic.parse(validDiag))).toEqual(ASTDiagnostic.parse(validDiag));
  });

  it("allows missing lessonLink", () => {
    const { lessonLink: _l, ...rest } = validDiag;
    expect(ASTDiagnostic.parse(rest).lessonLink).toBeUndefined();
  });

  it("rejects non-integer line", () => {
    expect(ASTDiagnostic.safeParse({ ...validDiag, line: 14.5 }).success).toBe(false);
  });

  it("rejects invalid severity", () => {
    expect(ASTDiagnostic.safeParse({ ...validDiag, severity: "critical" }).success).toBe(false);
  });

  it("rejects invalid lessonLink URL", () => {
    expect(
      ASTDiagnostic.safeParse({ ...validDiag, lessonLink: "not-a-url" }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// InterventionDecision
// ---------------------------------------------------------------------------
const validIntervention: InterventionDecision = {
  tier: 2,
  conceptId: "concept_loops",
  rationale: "Student repeated same error twice",
  expectedDurationSeconds: 120,
  fallbackTierIfStillStuck: 3,
  deliveryChannel: "notebook",
};

describe("InterventionDecision", () => {
  it("parses a valid intervention", () => {
    expect(InterventionDecision.parse(validIntervention)).toEqual(validIntervention);
  });

  it("roundtrips", () => {
    expect(
      InterventionDecision.parse(InterventionDecision.parse(validIntervention)),
    ).toEqual(InterventionDecision.parse(validIntervention));
  });

  it("rejects tier > 5", () => {
    expect(InterventionDecision.safeParse({ ...validIntervention, tier: 6 }).success).toBe(false);
  });

  it("rejects tier < 1", () => {
    expect(InterventionDecision.safeParse({ ...validIntervention, tier: 0 }).success).toBe(false);
  });

  it("rejects rationale > 200 chars", () => {
    expect(
      InterventionDecision.safeParse({ ...validIntervention, rationale: "x".repeat(201) }).success,
    ).toBe(false);
  });

  it("rejects invalid deliveryChannel", () => {
    expect(
      InterventionDecision.safeParse({ ...validIntervention, deliveryChannel: "telepathy" }).success,
    ).toBe(false);
  });

  it("accepts all valid delivery channels", () => {
    const channels = ["chat", "inline", "codelens", "notebook", "debug", "terminal"] as const;
    for (const ch of channels) {
      expect(
        InterventionDecision.parse({ ...validIntervention, deliveryChannel: ch }).deliveryChannel,
      ).toBe(ch);
    }
  });
});

// ---------------------------------------------------------------------------
// InterviewContext
// ---------------------------------------------------------------------------
const validContext: InterviewContext = {
  phase: "blueprint_interrogation",
  askedQuestions: [{ id: "q1", text: "Why did you choose this approach?", phase: "blueprint_interrogation" }],
  answers: [
    {
      questionId: "q1",
      answerText: "I thought it was simpler",
      audioUrl: "https://storage.example.com/audio/q1.webm",
      rubricScore: { correctness: 0.8, reasoningDepth: 0.6, tradeoffAwareness: 0.5 },
    },
  ],
  injectedBug: null,
  counterfactuals: [{ prompt: "What if you used a dict?", response: "It would be faster", score: 0.7 }],
};

describe("InterviewContext", () => {
  it("parses a valid context", () => {
    expect(InterviewContext.parse(validContext)).toEqual(validContext);
  });

  it("roundtrips", () => {
    expect(InterviewContext.parse(InterviewContext.parse(validContext))).toEqual(
      InterviewContext.parse(validContext),
    );
  });

  it("allows injectedBug to be non-null", () => {
    const withBug: InterviewContext = {
      ...validContext,
      phase: "bug_injection",
      injectedBug: {
        conceptId: "concept_loops",
        originalCode: "for i in range(10):",
        mutatedCode: "for i in range(9):",
        studentFixed: false,
      },
    };
    expect(InterviewContext.parse(withBug).injectedBug?.studentFixed).toBe(false);
  });

  it("rejects invalid phase", () => {
    expect(InterviewContext.safeParse({ ...validContext, phase: "warm_up" }).success).toBe(false);
  });

  it("rejects rubric score > 1", () => {
    const bad = {
      ...validContext,
      answers: [{ ...validContext.answers[0], rubricScore: { correctness: 1.5, reasoningDepth: 0.5, tradeoffAwareness: 0.5 } }],
    };
    expect(InterviewContext.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VerifiableCredentialSubject
// ---------------------------------------------------------------------------
const validVCS: VerifiableCredentialSubject = {
  projectTitle: "Habit Tracker with Streaks",
  conceptsDemonstrated: [
    { id: "concept_loops", name: "Loops", masteryScore: 0.85 },
  ],
  competencyRadar: {
    problemDecomposition: 0.82,
    dataModeling: 0.74,
    controlFlow: 0.91,
  },
  proofOfStruggle: [
    {
      errorSignature: "TypeError: unsupported operand",
      fixDiff: "@@ -14,1 +14,1 @@ -x +y",
      defenseAnswerId: "answer_7",
    },
  ],
  interviewSummary: {
    phases: [
      { phase: "blueprint_interrogation", questions: 4 },
      { phase: "bug_injection", questions: 2 },
    ],
    overallRubric: { correctness: 0.79, reasoningDepth: 0.71, tradeoffAwareness: 0.68 },
  },
};

describe("VerifiableCredentialSubject", () => {
  it("parses a valid credential subject", () => {
    expect(VerifiableCredentialSubject.parse(validVCS)).toEqual(validVCS);
  });

  it("roundtrips", () => {
    expect(
      VerifiableCredentialSubject.parse(VerifiableCredentialSubject.parse(validVCS)),
    ).toEqual(VerifiableCredentialSubject.parse(validVCS));
  });

  it("rejects masteryScore > 1 in conceptsDemonstrated", () => {
    const bad = {
      ...validVCS,
      conceptsDemonstrated: [{ id: "c1", name: "Loops", masteryScore: 1.5 }],
    };
    expect(VerifiableCredentialSubject.safeParse(bad).success).toBe(false);
  });

  it("rejects competencyRadar value > 1", () => {
    const bad = { ...validVCS, competencyRadar: { problemDecomposition: 2.0 } };
    expect(VerifiableCredentialSubject.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------
describe("Channels", () => {
  it("produces expected channel string for conceptNodes", () => {
    expect(Channels.conceptNodes("sess-123")).toBe("concept_nodes:sess-123");
  });

  it("produces expected channel string for edits", () => {
    expect(Channels.edits("sess-abc")).toBe("edits:sess-abc");
  });

  it("produces expected channel string for nudges", () => {
    expect(Channels.nudges("sess-xyz")).toBe("nudge:sess-xyz");
  });

  it("produces expected channel string for execution", () => {
    expect(Channels.execution("run-001")).toBe("execution:run-001");
  });
});

// ---------------------------------------------------------------------------
// EventKind + EventPayload
// ---------------------------------------------------------------------------
describe("EventKind", () => {
  it("parses known event kinds", () => {
    expect(EventKind.parse("code_run")).toBe("code_run");
    expect(EventKind.parse("defense_start")).toBe("defense_start");
    expect(EventKind.parse("credential_issued")).toBe("credential_issued");
  });

  it("rejects unknown event kind", () => {
    expect(EventKind.safeParse("unknown_event").success).toBe(false);
  });
});

describe("EventPayload", () => {
  it("parses test_fail payload", () => {
    const result = EventPayload.parse({
      kind: "test_fail",
      conceptIds: ["concept_loops"],
      runId: "run-001",
      stderrHash: "abc123",
    });
    expect(result.kind).toBe("test_fail");
  });

  it("parses mastery_updated payload", () => {
    const result = EventPayload.parse({
      kind: "mastery_updated",
      conceptId: "concept_loops",
      before: 0.4,
      after: 0.6,
    });
    expect(result.kind).toBe("mastery_updated");
  });

  it("rejects mismatched discriminant", () => {
    expect(
      EventPayload.safeParse({ kind: "code_run", conceptIds: ["x"], runId: "r" }).success,
    ).toBe(false);
  });
});
