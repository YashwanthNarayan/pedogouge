"use client";

import React, { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Citation {
  id: string;
  source: string;
  excerpt: string;
}

interface RunnableCell {
  lang: string;
  code: string;
}

interface LessonData {
  conceptId: string;
  bodyMd: string;
  plainText: string;
  citations: Citation[];
  metadata: {
    difficulty: "beginner" | "intermediate" | "advanced";
    prerequisiteConceptIds: string[];
    runnableCells: RunnableCell[];
    estimatedMinutes: number;
  };
}

// ---------------------------------------------------------------------------
// Citation superscript with tooltip
// ---------------------------------------------------------------------------

function CitationRef({
  num,
  citation,
}: {
  num: string;
  citation?: Citation;
}) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  return (
    <span
      ref={ref}
      style={{ position: "relative", display: "inline" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <a
        href={`#cite-${num}`}
        aria-label={`Citation ${num}`}
        style={{
          color: "#4f46e5",
          textDecoration: "none",
          fontSize: "0.75em",
          verticalAlign: "super",
          lineHeight: 0,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        [{num}]
      </a>

      {/* Tooltip */}
      {visible && citation && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1f2937",
            color: "#f9fafb",
            fontSize: 12,
            lineHeight: 1.5,
            padding: "8px 12px",
            borderRadius: 6,
            width: 260,
            zIndex: 10,
            boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
            pointerEvents: "none",
            whiteSpace: "normal",
          }}
        >
          <span style={{ fontStyle: "italic", display: "block", marginBottom: 4 }}>
            &ldquo;{citation.excerpt.slice(0, 120)}{citation.excerpt.length > 120 ? "…" : ""}&rdquo;
          </span>
          {citation.source && (
            <span style={{ color: "#9ca3af", fontSize: 11 }}>— {citation.source}</span>
          )}
          {/* Arrow */}
          <span
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              borderWidth: "5px 5px 0",
              borderStyle: "solid",
              borderColor: "#1f2937 transparent transparent",
              display: "block",
              width: 0,
              height: 0,
            }}
          />
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Markdown renderer (handles: headings, bold, inline code, code blocks,
//   footnote markers [^N] with hover tooltip)
// ---------------------------------------------------------------------------

function renderMarkdown(md: string, citations: Citation[]): React.JSX.Element[] {
  const citationMap = new Map(citations.map((c, i) => [String(i + 1), c]));
  const blocks: React.JSX.Element[] = [];
  const lines = md.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      blocks.push(
        <pre
          key={key++}
          style={{
            background: "#1e1e1e",
            color: "#d4d4d4",
            padding: "14px 18px",
            borderRadius: 8,
            overflowX: "auto",
            fontSize: 13,
            lineHeight: 1.6,
            margin: "16px 0",
            fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
          }}
        >
          {lang && (
            <span
              style={{
                display: "block",
                fontSize: 11,
                color: "#6b7280",
                marginBottom: 8,
                fontFamily: "sans-serif",
              }}
            >
              {lang}
            </span>
          )}
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      i++;
      continue;
    }

    // Headings
    if (line.startsWith("#### ")) {
      blocks.push(
        <h4 key={key++} style={{ margin: "20px 0 6px", fontSize: 14, fontWeight: 600, color: "#111827" }}>
          {inlineMarkdown(line.slice(5), citationMap)}
        </h4>,
      );
    } else if (line.startsWith("### ")) {
      blocks.push(
        <h3 key={key++} style={{ margin: "24px 0 8px", fontSize: 16, fontWeight: 600, color: "#111827" }}>
          {inlineMarkdown(line.slice(4), citationMap)}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h2 key={key++} style={{ margin: "28px 0 10px", fontSize: 18, fontWeight: 700, color: "#111827" }}>
          {inlineMarkdown(line.slice(3), citationMap)}
        </h2>,
      );
    } else if (line.startsWith("# ")) {
      blocks.push(
        <h1 key={key++} style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 700, color: "#111827" }}>
          {inlineMarkdown(line.slice(2), citationMap)}
        </h1>,
      );
    } else if (line.startsWith("> ")) {
      blocks.push(
        <blockquote
          key={key++}
          style={{
            margin: "12px 0",
            paddingLeft: 16,
            borderLeft: "3px solid #4f46e5",
            color: "#4b5563",
            fontStyle: "italic",
          }}
        >
          {inlineMarkdown(line.slice(2), citationMap)}
        </blockquote>,
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      blocks.push(
        <li key={key++} style={{ margin: "4px 0 4px 20px", lineHeight: 1.7, color: "#374151", listStyleType: "disc" }}>
          {inlineMarkdown(line.slice(2), citationMap)}
        </li>,
      );
    } else if (line.trim() === "") {
      // blank line — skip
    } else {
      blocks.push(
        <p key={key++} style={{ margin: "10px 0", lineHeight: 1.75, color: "#374151" }}>
          {inlineMarkdown(line, citationMap)}
        </p>,
      );
    }

    i++;
  }

  return blocks;
}

function inlineMarkdown(
  text: string,
  citationMap: Map<string, Citation>,
): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\^\d+\])/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={idx}
          style={{
            background: "#f3f4f6",
            padding: "2px 6px",
            borderRadius: 3,
            fontFamily: '"Fira Code", Consolas, monospace',
            fontSize: "0.88em",
            color: "#374151",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.match(/\[\^\d+\]/)) {
      const num = part.match(/\d+/)![0];
      return (
        <CitationRef key={idx} num={num} citation={citationMap.get(num)} />
      );
    }
    return part;
  });
}

// ---------------------------------------------------------------------------
// Difficulty badge
// ---------------------------------------------------------------------------

const DIFF_COLORS = {
  beginner: { bg: "#f0fdf4", color: "#15803d" },
  intermediate: { bg: "#fffbeb", color: "#92400e" },
  advanced: { bg: "#fef2f2", color: "#991b1b" },
};

// ---------------------------------------------------------------------------
// Citations footnotes
// ---------------------------------------------------------------------------

function CitationFootnotes({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;
  return (
    <section
      style={{
        marginTop: 48,
        borderTop: "1px solid #e5e7eb",
        paddingTop: 20,
      }}
    >
      <h3
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#6b7280",
          margin: "0 0 14px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        Sources
      </h3>
      <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {citations.map((c, i) => (
          <li
            key={c.id}
            id={`cite-${i + 1}`}
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 10,
              fontSize: 13,
              lineHeight: 1.6,
              scrollMarginTop: 80,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "#ede9fe",
                color: "#4f46e5",
                fontSize: 11,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 1,
              }}
            >
              {i + 1}
            </span>
            <span>
              <em style={{ color: "#374151" }}>
                &ldquo;{c.excerpt}&rdquo;
              </em>
              {c.source && (
                <span style={{ color: "#9ca3af", marginLeft: 6, fontSize: 12 }}>
                  — {c.source}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Mark-as-reviewed button
// ---------------------------------------------------------------------------

function MarkReviewedButton({
  sessionId,
  conceptId,
}: {
  sessionId: string;
  conceptId: string;
}) {
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");

  const handleClick = useCallback(async () => {
    setState("saving");
    try {
      await fetch("/api/sm2/mark-reviewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, conceptId, grade: 4 }),
      });
      setState("done");
    } catch {
      setState("idle");
    }
  }, [sessionId, conceptId]);

  return (
    <button
      onClick={handleClick}
      disabled={state !== "idle"}
      style={{
        padding: "9px 18px",
        background: state === "done" ? "#f0fdf4" : "#4f46e5",
        color: state === "done" ? "#15803d" : "#fff",
        border: state === "done" ? "1px solid #bbf7d0" : "none",
        borderRadius: 6,
        cursor: state === "idle" ? "pointer" : "default",
        fontSize: 13,
        fontWeight: 500,
        transition: "all 0.2s",
      }}
    >
      {state === "idle" && "✓ Mark as reviewed"}
      {state === "saving" && "Saving…"}
      {state === "done" && "✓ Reviewed!"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Runnable cells panel (read-only display — execution is VS Code side)
// ---------------------------------------------------------------------------

function RunnableCells({ cells }: { cells: RunnableCell[] }) {
  if (cells.length === 0) return null;
  return (
    <div
      style={{
        margin: "24px 0",
        border: "1px solid #ddd6fe",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: "#f5f3ff",
          padding: "8px 14px",
          fontSize: 12,
          color: "#5b21b6",
          fontWeight: 500,
          borderBottom: "1px solid #ddd6fe",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>▶</span>
        <span>Run these cells in VS Code (@tutor lesson)</span>
      </div>
      {cells.map((cell, i) => (
        <pre
          key={i}
          style={{
            margin: 0,
            padding: "12px 16px",
            background: "#1e1e1e",
            color: "#d4d4d4",
            fontSize: 13,
            lineHeight: 1.6,
            overflowX: "auto",
            fontFamily: '"Fira Code", Consolas, monospace',
            borderBottom: i < cells.length - 1 ? "1px solid #374151" : "none",
          }}
        >
          <span style={{ display: "block", fontSize: 10, color: "#6b7280", marginBottom: 6, fontFamily: "sans-serif" }}>
            {cell.lang}
          </span>
          <code>{cell.code}</code>
        </pre>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function LessonPage({
  params,
}: {
  params: Promise<{ id: string; conceptId: string }>;
}) {
  const { id: sessionId, conceptId } = use(params);
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/lessons/${conceptId}?sessionId=${sessionId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<LessonData>;
      })
      .then(setLesson)
      .catch((e: Error) => setError(e.message));
  }, [sessionId, conceptId]);

  if (error) {
    return (
      <div
        style={{
          padding: "40px 24px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p style={{ color: "#dc2626", fontSize: 14 }}>
          Failed to load lesson: {error}
        </p>
        <Link
          href={`/session/${sessionId}`}
          style={{ color: "#4f46e5", fontSize: 14 }}
        >
          ← Back to session
        </Link>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div
        style={{
          padding: "40px 24px",
          fontFamily: "system-ui, sans-serif",
          color: "#6b7280",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 16,
              height: 16,
              border: "2px solid #e5e7eb",
              borderTopColor: "#4f46e5",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span style={{ fontSize: 14 }}>Generating lesson with Citations…</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const diffStyle = DIFF_COLORS[lesson.metadata.difficulty];
  const title = conceptId
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: 740,
        margin: "0 auto",
        padding: "40px 24px 80px",
        color: "#111827",
      }}
    >
      {/* Breadcrumb */}
      <nav style={{ marginBottom: 24, fontSize: 13 }}>
        <Link
          href={`/session/${sessionId}`}
          style={{ color: "#6b7280", textDecoration: "none" }}
        >
          ← Session overview
        </Link>
      </nav>

      {/* Lesson header */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 600,
              background: diffStyle.bg,
              color: diffStyle.color,
            }}
          >
            {lesson.metadata.difficulty}
          </span>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            ~{lesson.metadata.estimatedMinutes} min
          </span>
          {lesson.metadata.prerequisiteConceptIds.length > 0 && (
            <span style={{ fontSize: 13, color: "#6b7280" }}>
              Prerequisites:{" "}
              {lesson.metadata.prerequisiteConceptIds.map((pid, i) => (
                <span key={pid}>
                  {i > 0 && ", "}
                  <Link
                    href={`/session/${sessionId}/lesson/${pid}`}
                    style={{ color: "#4f46e5", textDecoration: "none" }}
                  >
                    {pid.replace(/_/g, " ")}
                  </Link>
                </span>
              ))}
            </span>
          )}
          {lesson.citations.length > 0 && (
            <span
              style={{
                padding: "2px 8px",
                background: "#ede9fe",
                color: "#5b21b6",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {lesson.citations.length} source{lesson.citations.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, lineHeight: 1.3 }}>
          {title}
        </h1>
      </div>

      {/* Lesson body */}
      <article style={{ fontSize: 15 }}>
        {renderMarkdown(lesson.bodyMd, lesson.citations)}
      </article>

      {/* Runnable cells */}
      <RunnableCells cells={lesson.metadata.runnableCells} />

      {/* Citations */}
      <CitationFootnotes citations={lesson.citations} />

      {/* Actions */}
      <div
        style={{
          marginTop: 40,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <MarkReviewedButton sessionId={sessionId} conceptId={conceptId} />
        <Link
          href={`/session/${sessionId}`}
          style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}
        >
          ← Back to skill graph
        </Link>
      </div>
    </div>
  );
}
