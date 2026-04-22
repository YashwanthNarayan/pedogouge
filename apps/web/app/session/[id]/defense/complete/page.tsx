import Link from "next/link";

interface CompletePageProps {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Defense complete page — fetches rubric and optionally issues a credential
// ---------------------------------------------------------------------------

async function getDefenseResult(sessionId: string) {
  // TODO (P3 T3-14): fetch from /api/defense/{sessionId}/result
  return {
    overallRubric: {
      correctness: 0.78,
      reasoningDepth: 0.72,
      tradeoffAwareness: 0.65,
    },
    phases: [
      { phase: "blueprint_interrogation", questions: 4 },
      { phase: "bug_injection", bugFixed: true, timeSeconds: 127 },
      { phase: "counterfactual", questions: 3 },
    ],
    credentialUrl: null as string | null,
  };
}

const THRESHOLD = 0.6;

export default async function DefenseCompletePage({ params }: CompletePageProps) {
  const { id } = await params;
  const result = await getDefenseResult(id);
  const { overallRubric, phases } = result;

  const passed = Object.values(overallRubric).every((v) => v >= THRESHOLD);

  const radarDims = [
    { label: "Correctness", value: overallRubric.correctness },
    { label: "Reasoning Depth", value: overallRubric.reasoningDepth },
    { label: "Tradeoff Awareness", value: overallRubric.tradeoffAwareness },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className={`
            inline-flex items-center justify-center w-16 h-16 rounded-full mb-4
            ${passed ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"}
          `}>
            {passed ? "🎓" : "📚"}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {passed ? "Defense Complete!" : "Defense Finished"}
          </h1>
          <p className="text-gray-500 mt-2">
            {passed
              ? "You demonstrated strong understanding of your project."
              : "You've completed the defense. Keep learning!"}
          </p>
        </div>

        {/* Rubric scores */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-800 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Overall Rubric</h2>
          <div className="space-y-3">
            {radarDims.map((dim) => (
              <div key={dim.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700 dark:text-gray-300">{dim.label}</span>
                  <span className={`font-medium ${dim.value >= THRESHOLD ? "text-green-600" : "text-amber-600"}`}>
                    {Math.round(dim.value * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${dim.value >= THRESHOLD ? "bg-green-500" : "bg-amber-400"}`}
                    style={{ width: `${dim.value * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Phase summary */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-800 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Phase Summary</h2>
          <div className="space-y-3">
            {phases.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    Phase {i + 1}
                  </span>
                  <span className="text-gray-500 ml-2">
                    {p.phase.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-gray-600 dark:text-gray-400">
                  {"questions" in p
                    ? `${p.questions} questions`
                    : `Bug fixed in ${p.timeSeconds}s`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {passed ? (
            <form action={`/api/credentials/issue`} method="POST">
              <input type="hidden" name="sessionId" value={id} />
              <button
                type="submit"
                className="w-full py-3 px-6 rounded-lg bg-blue-600 text-white font-medium
                  hover:bg-blue-700 transition-colors"
              >
                Issue Verifiable Credential
              </button>
            </form>
          ) : (
            <p className="text-center text-sm text-gray-500">
              Credential requires ≥60% on all dimensions. Keep practicing!
            </p>
          )}

          <Link
            href={`/session/${id}`}
            className="text-center py-3 px-6 rounded-lg border dark:border-gray-700
              text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          >
            Back to Session
          </Link>
        </div>
      </div>
    </div>
  );
}
