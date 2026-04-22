import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CredentialClient from "./credential-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProofEntry {
  errorSignature: string;
  fixDiff: string;
  defenseAnswerId: string;
  defenseQuestion?: string;
}

interface CredentialSubject {
  projectTitle: string;
  conceptsDemonstrated: Array<{
    id: string;
    name: string;
    masteryScore: number;
  }>;
  competencyRadar: Record<string, number>;
  proofOfStruggle: ProofEntry[];
  interviewSummary: {
    phases: Array<{ phase: string; questions: number }>;
    overallRubric: {
      correctness: number;
      reasoningDepth: number;
      tradeoffAwareness: number;
    };
  };
}

interface WC3Credential {
  "@context": string[];
  type: string[];
  issuer: { id: string; name: string };
  validFrom: string;
  credentialSubject: CredentialSubject;
  proof?: {
    type: string;
    created: string;
    verificationMethod: string;
    jws: string;
  };
}

// ---------------------------------------------------------------------------
// Stub loader (P3 T3-18 replaces with real DB lookup)
// ---------------------------------------------------------------------------

async function loadCredential(_id: string): Promise<WC3Credential | null> {
  // TODO (P3 T3-18): SELECT credentials WHERE id = $1 → return vc_json
  return null;
}

// ---------------------------------------------------------------------------
// OG image metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const cred = await loadCredential(id);
  const title = cred?.credentialSubject.projectTitle ?? "Pedagogue Credential";
  return {
    title: `${title} — Pedagogue`,
    description: "Cryptographically verifiable learning credential backed by behavioral evidence.",
    openGraph: {
      title,
      description: "Built, debugged, and defended. Verified by Pedagogue.",
      images: [`/api/credential/${id}/og`],
    },
  };
}

// ---------------------------------------------------------------------------
// Demo credential used in dev/staging (filled in until real data exists)
// ---------------------------------------------------------------------------

const DEMO_CREDENTIAL: WC3Credential = {
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://pedagogue.app/schemas/v1",
  ],
  type: ["VerifiableCredential", "PedagogicalCompletionCredential"],
  issuer: { id: "https://pedagogue.app", name: "Pedagogue" },
  validFrom: new Date().toISOString(),
  credentialSubject: {
    projectTitle: "Habit Tracker with Streaks",
    conceptsDemonstrated: [
      { id: "concept_loops", name: "Loops & Iteration", masteryScore: 0.91 },
      { id: "concept_async", name: "Async/Await", masteryScore: 0.82 },
      { id: "concept_data_structures", name: "Data Structures", masteryScore: 0.74 },
      { id: "concept_functions", name: "Functions & Scope", masteryScore: 0.88 },
      { id: "concept_oop", name: "OOP Basics", masteryScore: 0.65 },
    ],
    competencyRadar: {
      problemDecomposition: 0.82,
      dataModeling: 0.74,
      controlFlow: 0.91,
      debuggingRigor: 0.68,
      apiDesign: 0.55,
      stateManagement: 0.71,
      testing: 0.6,
      reasoning: 0.79,
    },
    proofOfStruggle: [
      {
        errorSignature: "TypeError: 'int' object is not iterable",
        fixDiff: "@@ -14,1 +14,1 @@\n-for i in len(habits):\n+for i in range(len(habits)):",
        defenseAnswerId: "answer_3",
        defenseQuestion: "Why did you switch from len() to range(len())?",
      },
      {
        errorSignature: "AttributeError: 'NoneType' object has no attribute 'streak'",
        fixDiff: "@@ -28,3 +28,5 @@\n-habit = find_habit(name)\n-habit.streak += 1\n+habit = find_habit(name)\n+if habit is None:\n+    return\n+habit.streak += 1",
        defenseAnswerId: "answer_7",
        defenseQuestion: "What edge case did you discover and how did you handle it?",
      },
    ],
    interviewSummary: {
      phases: [
        { phase: "blueprint_interrogation", questions: 4 },
        { phase: "bug_injection", questions: 2 },
        { phase: "counterfactual", questions: 3 },
      ],
      overallRubric: {
        correctness: 0.79,
        reasoningDepth: 0.71,
        tradeoffAwareness: 0.68,
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Page (server component — fetches data, delegates interactivity to client)
// ---------------------------------------------------------------------------

export default async function CredentialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const credential = (await loadCredential(id)) ?? DEMO_CREDENTIAL;

  if (!credential && process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <CredentialClient
      credential={credential}
      credentialId={id}
    />
  );
}
