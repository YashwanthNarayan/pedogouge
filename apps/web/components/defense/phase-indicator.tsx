"use client";

export type DefensePhase =
  | "blueprint_interrogation"
  | "bug_injection"
  | "counterfactual"
  | "complete";

export const PHASE_LABELS: Record<DefensePhase, string> = {
  blueprint_interrogation: "Blueprint Questions",
  bug_injection: "Bug Injection",
  counterfactual: "Counterfactuals",
  complete: "Complete",
};

const VISIBLE_PHASES: DefensePhase[] = [
  "blueprint_interrogation",
  "bug_injection",
  "counterfactual",
];

interface PhaseIndicatorProps {
  currentPhase: DefensePhase;
  /** Optional callback fired when an already-completed phase label is clicked */
  onPhaseClick?: (phase: DefensePhase) => void;
}

/**
 * Renders a horizontal 1→2→3 phase indicator for the voice defense.
 * Completed phases show a check mark; active phase is highlighted blue;
 * future phases are gray.
 */
export function PhaseIndicator({ currentPhase, onPhaseClick }: PhaseIndicatorProps) {
  const currentIdx = VISIBLE_PHASES.indexOf(currentPhase);

  return (
    <nav aria-label="Defense phases" className="flex items-center gap-1">
      {VISIBLE_PHASES.map((phase, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        const isClickable = isDone && onPhaseClick != null;

        return (
          <div key={phase} className="flex items-center gap-1">
            {/* Phase step circle */}
            <button
              type="button"
              aria-label={`${PHASE_LABELS[phase]}${isDone ? " (complete)" : isActive ? " (current)" : ""}`}
              aria-current={isActive ? "step" : undefined}
              disabled={!isClickable}
              onClick={isClickable ? () => onPhaseClick(phase) : undefined}
              className={[
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold",
                "transition-colors duration-200 focus-visible:outline focus-visible:outline-2",
                "focus-visible:outline-offset-2 focus-visible:outline-blue-600",
                isDone
                  ? "bg-green-500 text-white"
                  : isActive
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/30"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
                isClickable ? "cursor-pointer hover:bg-green-600" : "cursor-default",
              ].join(" ")}
            >
              {isDone ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </button>

            {/* Connector line */}
            {i < VISIBLE_PHASES.length - 1 && (
              <div
                className={[
                  "h-0.5 w-8 rounded-full transition-colors duration-300",
                  i < currentIdx ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
