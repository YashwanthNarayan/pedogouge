"use client";

import { useState } from "react";

interface ConceptOption {
  id: string;
  name: string;
}

interface Props {
  sessionId: string | null;
  conceptNodes: ConceptOption[];
  teacherToken: string;
}

type NudgeKind = "hint" | "pause" | "redirect";

interface Toast {
  message: string;
  ok: boolean;
}

export function NudgePanel({ sessionId, conceptNodes, teacherToken }: Props) {
  const [activeKind, setActiveKind] = useState<NudgeKind | null>(null);
  const [hintText, setHintText] = useState("");
  const [redirectTarget, setRedirectTarget] = useState(conceptNodes[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const disabled = !sessionId;

  function showToast(message: string, ok: boolean) {
    setToast({ message, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function sendNudge(kind: NudgeKind, payload?: Record<string, unknown>) {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/teacher/nudge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${teacherToken}`,
        },
        body: JSON.stringify({ sessionId, kind, payload }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        showToast((err as { error?: string }).error ?? "Request failed", false);
      } else {
        showToast("Nudge sent", true);
        setActiveKind(null);
        setHintText("");
      }
    } catch {
      showToast("Network error", false);
    } finally {
      setLoading(false);
    }
  }

  const BUTTONS: { kind: NudgeKind; label: string }[] = [
    { kind: "hint",     label: "💡 Hint" },
    { kind: "pause",    label: "⏸ Pause" },
    { kind: "redirect", label: "🔀 Redirect" },
  ];

  return (
    <div
      style={{
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "16px 20px",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 12 }}>
        Send nudge
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            marginBottom: 12,
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            background: toast.ok ? "#dcfce7" : "#fee2e2",
            color: toast.ok ? "#14532d" : "#991b1b",
            border: `1px solid ${toast.ok ? "#86efac" : "#fca5a5"}`,
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Kind buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: activeKind ? 14 : 0 }}>
        {BUTTONS.map(({ kind, label }) => (
          <button
            key={kind}
            disabled={disabled || loading}
            onClick={() => setActiveKind(activeKind === kind ? null : kind)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: `1px solid ${activeKind === kind ? "#7c3aed" : "#d1d5db"}`,
              background: activeKind === kind ? "#ede9fe" : "#fff",
              color: activeKind === kind ? "#5b21b6" : "#374151",
              fontSize: 13,
              fontWeight: 500,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.4 : 1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Inline form */}
      {activeKind === "hint" && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            type="text"
            placeholder="Type hint message…"
            value={hintText}
            onChange={(e) => setHintText(e.target.value)}
            style={{
              flex: 1,
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 13,
              outline: "none",
            }}
          />
          <button
            disabled={!hintText.trim() || loading}
            onClick={() => sendNudge("hint", { text: hintText.trim() })}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              background: "#7c3aed",
              color: "#fff",
              border: "none",
              fontSize: 13,
              fontWeight: 500,
              cursor: !hintText.trim() || loading ? "not-allowed" : "pointer",
              opacity: !hintText.trim() || loading ? 0.6 : 1,
            }}
          >
            Send
          </button>
        </div>
      )}

      {activeKind === "pause" && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 8px" }}>
            This will send a pause signal to the student&apos;s editor.
          </p>
          <button
            disabled={loading}
            onClick={() => sendNudge("pause")}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              background: "#7c3aed",
              color: "#fff",
              border: "none",
              fontSize: 13,
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            Send pause
          </button>
        </div>
      )}

      {activeKind === "redirect" && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          <select
            value={redirectTarget}
            onChange={(e) => setRedirectTarget(e.target.value)}
            style={{
              flex: 1,
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 13,
              background: "#fff",
            }}
          >
            {conceptNodes.length === 0 && (
              <option value="">No concepts available</option>
            )}
            {conceptNodes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            disabled={!redirectTarget || loading || conceptNodes.length === 0}
            onClick={() => sendNudge("redirect", { conceptId: redirectTarget })}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              background: "#7c3aed",
              color: "#fff",
              border: "none",
              fontSize: 13,
              fontWeight: 500,
              cursor: !redirectTarget || loading ? "not-allowed" : "pointer",
              opacity: !redirectTarget || loading ? 0.6 : 1,
            }}
          >
            Send
          </button>
        </div>
      )}

      {disabled && (
        <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 10, marginBottom: 0 }}>
          No active session — nudges are unavailable.
        </p>
      )}
    </div>
  );
}
