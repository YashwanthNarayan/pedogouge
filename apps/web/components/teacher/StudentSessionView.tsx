"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { NudgePanel } from "./NudgePanel";

interface ConceptNode {
  id: string;
  name: string;
  mastery_score: number;
  struggle_pattern: string;
}

interface EventRow {
  id: string;
  ts: string;
  kind: string;
  payload_json: Record<string, unknown> | null;
}

interface Props {
  sessionId: string;
  conceptNodes: ConceptNode[];
  recentEvents: EventRow[];
  snapshotCount: number;
  teacherToken: string;
}

function masteryColor(score: number): string {
  if (score >= 0.8) return "#16a34a";
  if (score >= 0.5) return "#ca8a04";
  if (score >= 0.2) return "#ea580c";
  return "#dc2626";
}

const EVENT_KIND_LABELS: Record<string, string> = {
  file_open:      "Opened file",
  keystroke:      "Keystrokes",
  run:            "Ran code",
  error:          "Error",
  chat_message:   "Chat message",
  concept_update: "Concept update",
  session_start:  "Session started",
  session_end:    "Session ended",
};

export function StudentSessionView({
  sessionId,
  conceptNodes,
  recentEvents,
  snapshotCount,
  teacherToken,
}: Props) {
  const radarData = conceptNodes.map((n) => ({
    subject: n.name.length > 14 ? n.name.slice(0, 12) + "…" : n.name,
    mastery: Math.round(n.mastery_score * 100),
    fullName: n.name,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Snapshot badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 12px",
            borderRadius: 99,
            background: "#ede9fe",
            color: "#5b21b6",
            fontSize: 13,
            fontWeight: 500,
            border: "1px solid #c4b5fd",
          }}
        >
          {snapshotCount} snapshot{snapshotCount !== 1 ? "s" : ""} taken
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Concept mastery radar */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "20px 24px",
          }}
        >
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#374151" }}>
            Concept Mastery
          </h3>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#6b7280" }} />
                <Radar
                  name="Mastery"
                  dataKey="mastery"
                  stroke="#7c3aed"
                  fill="#7c3aed"
                  fillOpacity={0.25}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: number, _n: string, p: any) => [`${v}%`, p?.payload?.fullName ?? _n]}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: "#9ca3af", fontSize: 13 }}>No concept data yet.</p>
          )}

          {/* Legend */}
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {conceptNodes.map((n) => (
              <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: masteryColor(n.mastery_score),
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, color: "#374151", flex: 1 }}>{n.name}</span>
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  {Math.round(n.mastery_score * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent events timeline */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "20px 24px",
            overflowY: "auto",
            maxHeight: 380,
          }}
        >
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#374151" }}>
            Recent Activity
          </h3>
          {recentEvents.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: 13 }}>No events recorded.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {recentEvents.map((ev, i) => (
                <div
                  key={ev.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    paddingBottom: i < recentEvents.length - 1 ? 12 : 0,
                    marginBottom: i < recentEvents.length - 1 ? 12 : 0,
                    borderBottom: i < recentEvents.length - 1 ? "1px solid #f3f4f6" : "none",
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#7c3aed",
                      marginTop: 4,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>
                      {EVENT_KIND_LABELS[ev.kind] ?? ev.kind}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                      {new Date(ev.ts).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Nudge panel */}
      <NudgePanel
        sessionId={sessionId}
        conceptNodes={conceptNodes.map((n) => ({ id: n.id, name: n.name }))}
        teacherToken={teacherToken}
      />
    </div>
  );
}
