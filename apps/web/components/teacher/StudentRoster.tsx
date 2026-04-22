import Link from "next/link";

export interface StudentRow {
  userId: string;
  email: string;
  displayName: string | null;
  sessionId: string | null;
  lastActive: string | null;
  masteryAvg: number | null;
  consentGiven: boolean;
}

function ConsentBadge({ granted }: { granted: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 99,
        background: granted ? "#dcfce7" : "#fef3c7",
        color: granted ? "#14532d" : "#92400e",
        border: `1px solid ${granted ? "#86efac" : "#fcd34d"}`,
      }}
    >
      {granted ? "✓ Consented" : "⚠ No consent"}
    </span>
  );
}

function MasteryBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "#16a34a" : pct >= 50 ? "#ca8a04" : pct >= 20 ? "#ea580c" : "#dc2626";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 72,
          height: 6,
          borderRadius: 3,
          background: "#e5e7eb",
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color: "#374151", minWidth: 34 }}>{pct}%</span>
    </div>
  );
}

export function StudentRoster({
  students,
  classId,
}: {
  students: StudentRow[];
  classId: string;
}) {
  if (students.length === 0) {
    return (
      <p style={{ color: "#6b7280", fontSize: 14, padding: "24px 0" }}>
        No students in this class yet.
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
          color: "#111827",
        }}
      >
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
            {["Name / Email", "Consent", "Last active", "Avg mastery", "Session"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  fontWeight: 600,
                  color: "#374151",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const masteryPct =
              s.masteryAvg !== null ? Math.round(s.masteryAvg * 100) : null;
            const canView = s.consentGiven && s.sessionId;

            return (
              <tr
                key={s.userId}
                style={{ borderBottom: "1px solid #f3f4f6" }}
              >
                <td style={{ padding: "10px 12px" }}>
                  <div style={{ fontWeight: 500 }}>{s.displayName ?? s.email}</div>
                  {s.displayName && (
                    <div style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}>{s.email}</div>
                  )}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <ConsentBadge granted={s.consentGiven} />
                </td>
                <td style={{ padding: "10px 12px", color: "#6b7280" }}>
                  {s.lastActive
                    ? new Date(s.lastActive).toLocaleDateString()
                    : "—"}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  {masteryPct !== null ? <MasteryBar pct={masteryPct} /> : <span style={{ color: "#9ca3af" }}>—</span>}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  {canView ? (
                    <Link
                      href={`/class/${classId}/students/${s.userId}`}
                      style={{ color: "#7c3aed", fontWeight: 500, textDecoration: "none" }}
                    >
                      View →
                    </Link>
                  ) : (
                    <span style={{ color: "#d1d5db", cursor: "not-allowed" }}>View →</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
