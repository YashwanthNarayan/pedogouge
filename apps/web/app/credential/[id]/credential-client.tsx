"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "react-qr-code";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

// ---------------------------------------------------------------------------
// Types (re-declared; import from shared when Supabase types ship)
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
// Helpers
// ---------------------------------------------------------------------------

function pct(score: number) {
  return `${Math.round(score * 100)}%`;
}

function rubrciColor(score: number) {
  if (score >= 0.75) return "#16a34a";
  if (score >= 0.5) return "#ca8a04";
  return "#dc2626";
}

function phaseLabel(phase: string) {
  const map: Record<string, string> = {
    blueprint_interrogation: "Blueprint Q&A",
    bug_injection: "Bug Injection",
    counterfactual: "Counterfactual",
  };
  return map[phase] ?? phase;
}

// ---------------------------------------------------------------------------
// Session Timeline
// ---------------------------------------------------------------------------

const PHASE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  blueprint_interrogation: { bg: "#ede9fe", border: "#7c3aed", text: "#5b21b6" },
  bug_injection: { bg: "#fef3c7", border: "#d97706", text: "#92400e" },
  counterfactual: { bg: "#dcfce7", border: "#16a34a", text: "#14532d" },
};

function SessionTimeline({
  phases,
}: {
  phases: Array<{ phase: string; questions: number }>;
}) {
  const total = phases.reduce((sum, p) => sum + p.questions, 0);
  return (
    <div>
      <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>
        Session Timeline
      </h2>
      {/* Phase bar */}
      <div
        style={{
          display: "flex",
          height: 12,
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 14,
          gap: 2,
        }}
      >
        {phases.map((p) => {
          const colors = PHASE_COLORS[p.phase] ?? { bg: "#e5e7eb", border: "#9ca3af", text: "#374151" };
          return (
            <div
              key={p.phase}
              title={`${phaseLabel(p.phase)}: ${p.questions} questions`}
              style={{
                flex: p.questions / total,
                background: colors.border,
                borderRadius: 3,
              }}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {phases.map((p, i) => {
          const colors = PHASE_COLORS[p.phase] ?? { bg: "#e5e7eb", border: "#9ca3af", text: "#374151" };
          return (
            <div key={p.phase} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Step dot */}
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: colors.bg,
                  border: `2px solid ${colors.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: colors.text,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>
                  {phaseLabel(p.phase)}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  {p.questions} questions
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Competency Radar
// ---------------------------------------------------------------------------

function CompetencyRadar({ data }: { data: Record<string, number> }) {
  const radarData = Object.entries(data).map(([key, value]) => ({
    subject: key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase()),
    value: Math.round(value * 100),
    fullMark: 100,
  }));

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fontSize: 11, fill: "#6b7280" }}
          />
          <Radar
            name="Competency"
            dataKey="value"
            stroke="#4f46e5"
            fill="#4f46e5"
            fillOpacity={0.2}
          />
          <Tooltip formatter={(v: number) => [`${v}%`, "Score"]} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proof-of-Struggle entry
// ---------------------------------------------------------------------------

function ProofEntry({ entry, index }: { entry: ProofEntry; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        overflow: "hidden",
        marginBottom: 8,
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          padding: "12px 16px",
          background: open ? "#fafafa" : "#fff",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13,
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#fef3c7",
            color: "#92400e",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {index + 1}
        </span>
        <span style={{ flex: 1, color: "#374151", fontFamily: "monospace", fontSize: 12 }}>
          {entry.errorSignature}
        </span>
        <span style={{ color: "#9ca3af", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                padding: "0 16px 16px",
                background: "#fafafa",
                borderTop: "1px solid #f3f4f6",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Fix diff */}
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 6,
                      marginTop: 12,
                    }}
                  >
                    Fix diff
                  </div>
                  <pre
                    style={{
                      background: "#1e1e1e",
                      color: "#d4d4d4",
                      padding: "10px 14px",
                      borderRadius: 6,
                      fontSize: 12,
                      overflowX: "auto",
                      margin: 0,
                      fontFamily: '"Fira Code", Consolas, monospace',
                    }}
                  >
                    {entry.fixDiff.split("\n").map((line, i) => (
                      <span
                        key={i}
                        style={{
                          display: "block",
                          color: line.startsWith("+")
                            ? "#4ade80"
                            : line.startsWith("-")
                            ? "#f87171"
                            : "#d4d4d4",
                        }}
                      >
                        {line}
                      </span>
                    ))}
                  </pre>
                </div>

                {/* Defense Q&A */}
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 6,
                      marginTop: 12,
                    }}
                  >
                    Defense Question
                  </div>
                  {entry.defenseQuestion ? (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        color: "#374151",
                        lineHeight: 1.6,
                        fontStyle: "italic",
                      }}
                    >
                      &ldquo;{entry.defenseQuestion}&rdquo;
                    </p>
                  ) : (
                    <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>
                      Answer ID: {entry.defenseAnswerId}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verify button
// ---------------------------------------------------------------------------

function VerifyButton({ credentialId }: { credentialId: string }) {
  const [state, setState] = useState<"idle" | "checking" | "valid" | "invalid">("idle");

  const handleVerify = useCallback(async () => {
    setState("checking");
    try {
      const r = await fetch(`/api/credential/${credentialId}/verify`, {
        method: "POST",
      });
      const data = (await r.json()) as { valid: boolean };
      setState(data.valid ? "valid" : "invalid");
    } catch {
      setState("invalid");
    }
  }, [credentialId]);

  const styles: Record<string, React.CSSProperties> = {
    idle: { background: "#4f46e5", color: "#fff" },
    checking: { background: "#6366f1", color: "#fff" },
    valid: { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" },
    invalid: { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" },
  };

  return (
    <button
      onClick={state === "idle" ? handleVerify : undefined}
      disabled={state === "checking"}
      style={{
        padding: "9px 18px",
        borderRadius: 6,
        border: "none",
        cursor: state === "idle" ? "pointer" : "default",
        fontSize: 13,
        fontWeight: 500,
        transition: "all 0.2s",
        ...styles[state],
      }}
    >
      {state === "idle" && "🔐 Verify credential"}
      {state === "checking" && "Verifying…"}
      {state === "valid" && "✓ Signature valid"}
      {state === "invalid" && "✗ Verification failed"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Share button
// ---------------------------------------------------------------------------

function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [url, title]);

  return (
    <button
      onClick={handleShare}
      style={{
        padding: "9px 18px",
        borderRadius: 6,
        border: "1px solid #e5e7eb",
        background: "#fff",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500,
        color: "#374151",
      }}
    >
      {copied ? "✓ Copied!" : "↗ Share"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Download JSON button
// ---------------------------------------------------------------------------

function DownloadJSON({ credential }: { credential: WC3Credential }) {
  const handleDownload = useCallback(() => {
    const blob = new Blob([JSON.stringify(credential, null, 2)], {
      type: "application/ld+json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pedagogue-credential.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [credential]);

  return (
    <button
      onClick={handleDownload}
      style={{
        padding: "9px 18px",
        borderRadius: 6,
        border: "1px solid #e5e7eb",
        background: "#fff",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500,
        color: "#374151",
      }}
    >
      ↓ Download JSON-LD
    </button>
  );
}

// ---------------------------------------------------------------------------
// Crypto proof section (with JWS "Show full" toggle + live verify indicator)
// ---------------------------------------------------------------------------

function CryptoProofSection({
  credential,
  credentialId,
  credentialUrl,
}: {
  credential: WC3Credential;
  credentialId: string;
  credentialUrl: string;
}) {
  const [showFullJws, setShowFullJws] = useState(false);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 32,
        padding: "24px",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        background: "#fafafa",
        alignItems: "start",
        marginBottom: 32,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <QRCode value={credentialUrl} size={120} style={{ display: "block" }} />
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>
          Scan to open on mobile
        </div>
      </div>

      <div>
        <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, color: "#111827" }}>
          Cryptographic Proof
        </h3>
        {credential.proof ? (
          <>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
              Type: {credential.proof.type}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
              Key ID:{" "}
              <code
                style={{
                  background: "#f3f4f6",
                  padding: "1px 5px",
                  borderRadius: 3,
                  fontFamily: "monospace",
                  fontSize: 11,
                }}
              >
                {credential.proof.verificationMethod.split("#").pop()}
              </code>
            </div>

            {/* JWS display with toggle */}
            <div
              style={{
                background: "#1e1e1e",
                borderRadius: 6,
                padding: "8px 10px",
                fontFamily: "monospace",
                fontSize: 11,
                color: "#d4d4d4",
                overflowX: "auto",
                wordBreak: "break-all",
                marginBottom: 6,
                position: "relative",
              }}
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  key={showFullJws ? "full" : "truncated"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: "block" }}
                >
                  {showFullJws
                    ? credential.proof.jws
                    : `${credential.proof.jws.slice(0, 80)}…`}
                </motion.span>
              </AnimatePresence>
            </div>
            <button
              onClick={() => setShowFullJws((v) => !v)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                color: "#6366f1",
                padding: 0,
                marginBottom: 8,
              }}
            >
              {showFullJws ? "Hide full JWS" : "Show full JWS"}
            </button>

            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Verify at{" "}
              <code style={{ fontFamily: "monospace", fontSize: 11 }}>
                /api/credential/{credentialId}/verify
              </code>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: "#9ca3af" }}>
            Proof not yet attached — credential issuance pending defense completion.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export default function CredentialClient({
  credential,
  credentialId,
}: {
  credential: WC3Credential;
  credentialId: string;
}) {
  const subject = credential.credentialSubject;
  const rubric = subject.interviewSummary.overallRubric;
  const credentialUrl =
    typeof window !== "undefined"
      ? window.location.href
      : `https://pedagogue.app/credential/${credentialId}`;

  return (
    <div
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: 900,
        margin: "0 auto",
        padding: "40px 24px 80px",
        color: "#111827",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "28px 32px",
          background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
          borderRadius: 12,
          color: "#fff",
          marginBottom: 32,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Pedagogue · Verified Learning Credential
        </div>
        <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 700 }}>
          {subject.projectTitle}
        </h1>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          Issued {new Date(credential.validFrom).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </div>
        <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>
          by {credential.issuer.name}
        </div>
      </div>

      {/* Action bar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 36,
          alignItems: "center",
        }}
      >
        <VerifyButton credentialId={credentialId} />
        <ShareButton
          url={credentialUrl}
          title={`${subject.projectTitle} — Pedagogue Credential`}
        />
        <DownloadJSON credential={credential} />
      </div>

      {/* Main grid: radar + stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          marginBottom: 36,
        }}
      >
        {/* Radar chart */}
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "20px 16px",
            background: "#fff",
          }}
        >
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>
            Competency Radar
          </h2>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6b7280" }}>
            8 dimensions from voice defense rubric
          </p>
          <CompetencyRadar data={subject.competencyRadar} />
        </div>

        {/* Interview summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Overall rubric */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "20px 20px",
              background: "#fff",
            }}
          >
            <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>
              Defense Rubric
            </h2>
            {(
              [
                ["Correctness", rubric.correctness],
                ["Reasoning Depth", rubric.reasoningDepth],
                ["Tradeoff Awareness", rubric.tradeoffAwareness],
              ] as [string, number][]
            ).map(([label, score]) => (
              <div key={label} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "#374151" }}>{label}</span>
                  <span style={{ color: rubrciColor(score), fontWeight: 600 }}>
                    {pct(score)}
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: "#e5e7eb",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: pct(score),
                      background: rubrciColor(score),
                      borderRadius: 3,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Session timeline */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "20px 20px",
              background: "#fff",
            }}
          >
            <SessionTimeline phases={subject.interviewSummary.phases} />
          </div>
        </div>
      </div>

      {/* Concepts demonstrated */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 14px" }}>
          Concepts Demonstrated
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          {subject.conceptsDemonstrated.map((c) => (
            <div
              key={c.id}
              style={{
                padding: "12px 14px",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", marginBottom: 6 }}>
                {c.name}
              </div>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: "#e5e7eb",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: pct(c.masteryScore),
                    background: rubrciColor(c.masteryScore),
                    borderRadius: 2,
                  }}
                />
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                {pct(c.masteryScore)} mastery
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Proof of struggle */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px" }}>
          Proof of Struggle
        </h2>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>
          Real errors the student encountered, fixed, and defended — each entry is a triple of
          error → fix diff → defense answer.
        </p>
        {subject.proofOfStruggle.length > 0 ? (
          subject.proofOfStruggle.map((entry, i) => (
            <ProofEntry key={entry.defenseAnswerId} entry={entry} index={i} />
          ))
        ) : (
          <p style={{ color: "#9ca3af", fontSize: 13 }}>
            No proof-of-struggle entries yet.
          </p>
        )}
      </section>

      {/* QR code + cryptographic proof */}
      <CryptoProofSection credential={credential} credentialId={credentialId} credentialUrl={credentialUrl} />

      {/* W3C context */}
      <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
        <span>W3C Verifiable Credentials v2.0</span>
        <span style={{ margin: "0 8px" }}>·</span>
        <span>Issued by {credential.issuer.name}</span>
        <span style={{ margin: "0 8px" }}>·</span>
        <a
          href={credential["@context"][0]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#9ca3af" }}
        >
          Context spec
        </a>
      </div>
    </div>
  );
}
