"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditRange {
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
}

interface RemoteEdit {
  path: string;
  range: [number, number, number, number]; // [startLine, startChar, endLine, endChar]
  newText: string;
}

interface EditEnvelope {
  sessionId: string;
  author: string;
  nonce: string;
  ts: number;
  edits: RemoteEdit[];
  phase: string;
}

interface BugPreviewProps {
  /** Supabase session ID — used to subscribe to edits:{sessionId} channel */
  sessionId: string;
  /** Called with each incoming verified envelope (for logging / UI feedback) */
  onEditReceived?: (envelope: EditEnvelope) => void;
}

// ---------------------------------------------------------------------------
// Diff line types
// ---------------------------------------------------------------------------

type DiffLineKind = "removed" | "added" | "context";

interface DiffLine {
  kind: DiffLineKind;
  lineNo: number | null;
  text: string;
}

// ---------------------------------------------------------------------------
// Produce a simple unified-diff-style view from a RemoteEdit
// ---------------------------------------------------------------------------

function buildDiffLines(edit: RemoteEdit): DiffLine[] {
  const lines: DiffLine[] = [];
  const [startLine] = edit.range;

  // Context line: "... (line N)" placeholder for non-adjacent context
  if (startLine > 0) {
    lines.push({ kind: "context", lineNo: null, text: `@@ line ${startLine + 1} @@` });
  }

  // Old text placeholder — we don't have the full file, so label it generically
  lines.push({
    kind: "removed",
    lineNo: startLine + 1,
    text: `[original code at line ${startLine + 1}]`,
  });

  // New text lines
  const newLines = edit.newText.split("\n");
  newLines.forEach((text, i) => {
    lines.push({ kind: "added", lineNo: startLine + 1 + i, text });
  });

  return lines;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * BugPreview subscribes to Supabase Realtime `edits:{sessionId}` and shows
 * a diff-style panel whenever a defense Phase 2 edit arrives.
 *
 * This component is READ-ONLY — it only displays what the extension will apply.
 * Actual application + verification happen in the VS Code extension.
 */
export function BugPreview({ sessionId, onEditReceived }: BugPreviewProps) {
  const [envelopes, setEnvelopes] = useState<EditEnvelope[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    // Dynamically import Supabase client to avoid SSR issues
    let channel: { unsubscribe: () => void } | null = null;

    (async () => {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        channel = supabase
          .channel(`edits:${sessionId}`)
          .on("broadcast", { event: "edit" }, (payload: { payload: EditEnvelope }) => {
            const envelope = payload.payload;
            // Only surface Phase 2 bug injection edits in this UI
            if (envelope.phase !== "bug_injection") return;
            setEnvelopes((prev) => [...prev, envelope]);
            setExpanded((prev) => prev === null ? 0 : prev); // auto-expand first
            onEditReceived?.(envelope);
          })
          .subscribe();
      } catch (err) {
        console.error("[BugPreview] Realtime subscription failed:", err);
      }
    })();

    return () => {
      channel?.unsubscribe();
    };
  }, [sessionId, onEditReceived]);

  if (envelopes.length === 0) return null;

  return (
    <aside
      aria-label="Phase 2 bug injection preview"
      className="w-80 border-l dark:border-gray-800 flex flex-col overflow-hidden bg-amber-50/50 dark:bg-amber-950/20"
    >
      <div className="px-4 py-3 border-b dark:border-gray-800 bg-amber-100/60 dark:bg-amber-900/30">
        <div className="flex items-center gap-2">
          <span className="text-amber-600 dark:text-amber-400" aria-hidden>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </span>
          <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Bug Injection — Phase 2
          </h2>
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
          The interviewer has injected a bug into your code. Fix it in VS Code to continue.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {envelopes.map((env, envIdx) => (
          <div key={env.nonce} className="border-b dark:border-gray-800 last:border-b-0">
            {/* Envelope header */}
            <button
              type="button"
              onClick={() => setExpanded(expanded === envIdx ? null : envIdx)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left
                hover:bg-amber-100/40 dark:hover:bg-amber-900/20 transition-colors"
              aria-expanded={expanded === envIdx}
            >
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Edit {envIdx + 1} · {env.edits.length} file{env.edits.length !== 1 ? "s" : ""}
              </span>
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform ${expanded === envIdx ? "rotate-180" : ""}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expanded === envIdx && (
              <div className="px-3 pb-3 space-y-3">
                {env.edits.map((edit, editIdx) => {
                  const diffLines = buildDiffLines(edit);
                  return (
                    <div key={editIdx} className="rounded overflow-hidden border dark:border-gray-700 text-xs font-mono">
                      {/* File path header */}
                      <div className="px-3 py-1.5 bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-b dark:border-gray-700">
                        {edit.path}
                      </div>

                      {/* Diff lines */}
                      <div className="overflow-x-auto">
                        {diffLines.map((line, li) => (
                          <div
                            key={li}
                            className={[
                              "flex items-start leading-5",
                              line.kind === "removed"
                                ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                                : line.kind === "added"
                                  ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400"
                                  : "text-gray-400 dark:text-gray-500 bg-transparent",
                            ].join(" ")}
                          >
                            <span className="w-6 text-right pr-2 select-none text-gray-400 shrink-0">
                              {line.kind === "removed" ? "-" : line.kind === "added" ? "+" : ""}
                            </span>
                            <span className="w-8 text-right pr-3 select-none text-gray-400 shrink-0">
                              {line.lineNo ?? ""}
                            </span>
                            <span className="whitespace-pre pr-3">{line.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t dark:border-gray-800 text-xs text-amber-700 dark:text-amber-400 bg-amber-100/40 dark:bg-amber-900/20">
        Apply the edit in VS Code, fix the bug, then speak your explanation.
      </div>
    </aside>
  );
}
