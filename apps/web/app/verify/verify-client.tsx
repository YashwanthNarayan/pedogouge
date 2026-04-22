"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { VerifyResult } from "./page";

function radarData(radar: Record<string, number>) {
  return Object.entries(radar).map(([key, value]) => ({
    subject: key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase()),
    value: Math.round(value * 100),
    fullMark: 100,
  }));
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

function scoreColor(v: number) {
  if (v >= 0.75) return "#16a34a";
  if (v >= 0.5) return "#ca8a04";
  return "#dc2626";
}

// ---------------------------------------------------------------------------
// Share button
// ---------------------------------------------------------------------------

function ShareButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const handleShare = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Pedagogue Verified Credential", url });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [url]);

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
      {copied ? "✓ Copied!" : "↗ Share link"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export default function VerifyClient({
  result,
  credentialId,
}: {
  result: VerifyResult | null;
  credentialId: string | null;
}) {
  const pageUrl =
    typeof window !== "undefined"
      ? window.location.href
      : credentialId
        ? `https://pedagogue.app/verify?id=${credentialId}`
        : "https://pedagogue.app/verify";

  if (!result) {
    return (
      <div
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          maxWidth: 600,
          margin: "80px auto",
          padding: "0 24px",
          textAlign: "center",
          color: "#374151",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>
          Missing credential ID
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280" }}>
          Use a link of the form{" "}
          <code style={{ fontFamily: "monospace" }}>
            /verify?id=&lt;credential-uuid&gt;
          </code>
        </p>
      </div>
    );
  }

  const isValid = result.valid;
  const subject = result.subject;

  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: 860,
        margin: "0 auto",
        padding: "40px 24px 80px",
        color: "#111827",
      }}
    >
      {/* Validity banner */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          padding: "20px 28px",
          borderRadius: 12,
          marginBottom: 32,
          background: isValid
            ? "linear-gradient(135deg, #16a34a 0%, #15803d 100%)"
            : "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <span style={{ fontSize: 36 }}>{isValid ? "✓" : "✗"}</span>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {isValid ? "Valid credential" : "Invalid credential"}
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
            {isValid
              ? `Issued ${
                  result.issuedAt
                    ? new Date(result.issuedAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "—"
                } · Cryptographic signature verified`
              : result.reason ?? "Signature could not be verified"}
          </div>
        </div>
      </motion.div>

      {/* Share + view full credential */}
      <div style={{ display: "flex", gap: 10, marginBottom: 32, flexWrap: "wrap" }}>
        <ShareButton url={pageUrl} />
        {credentialId && (
          <a
            href={`/credential/${credentialId}`}
            style={{
              padding: "9px 18px",
              borderRadius: 6,
              border: "none",
              background: "#4f46e5",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            View full credential →
          </a>
        )}
      </div>

      {subject && isValid && (
        <>
          {/* Project title */}
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>
            {subject.projectTitle}
          </h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 32px" }}>
            Issued by Pedagogue · Verified via Ed25519 cryptographic proof
          </p>

          {/* Two-column: radar + concepts */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 24,
              marginBottom: 32,
            }}
          >
            {/* Radar */}
            {Object.keys(subject.competencyRadar).length > 0 && (
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
                  Voice defense scores
                </p>
                <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <RadarChart data={radarData(subject.competencyRadar)}>
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fontSize: 10, fill: "#6b7280" }}
                      />
                      <Radar
                        name="Score"
                        dataKey="value"
                        stroke="#4f46e5"
                        fill="#4f46e5"
                        fillOpacity={0.2}
                      />
                      <Tooltip formatter={(v: number) => [`${v}%`, "Score"]} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Concepts */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "20px",
                background: "#fff",
              }}
            >
              <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>
                Concepts Demonstrated
              </h2>
              {subject.conceptsDemonstrated.map((c) => (
                <div key={c.id} style={{ marginBottom: 10 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      marginBottom: 3,
                    }}
                  >
                    <span style={{ color: "#374151" }}>{c.name}</span>
                    <span
                      style={{ color: scoreColor(c.masteryScore), fontWeight: 600 }}
                    >
                      {pct(c.masteryScore)}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 5,
                      borderRadius: 3,
                      background: "#e5e7eb",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: pct(c.masteryScore),
                        background: scoreColor(c.masteryScore),
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Defense rubric */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "20px",
              background: "#fff",
              marginBottom: 32,
            }}
          >
            <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>
              Defense Rubric
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 20,
              }}
            >
              {(
                [
                  ["Correctness", subject.interviewSummary.overallRubric.correctness],
                  ["Reasoning", subject.interviewSummary.overallRubric.reasoningDepth],
                  ["Tradeoffs", subject.interviewSummary.overallRubric.tradeoffAwareness],
                ] as [string, number][]
              ).map(([label, score]) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: scoreColor(score),
                    }}
                  >
                    {pct(score)}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
        Pedagogue · W3C Verifiable Credentials v2.0 · Ed25519 signature
        {credentialId && (
          <>
            {" · "}
            <a
              href={`/api/credential/verify?id=${credentialId}`}
              style={{ color: "#9ca3af" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Raw verification endpoint
            </a>
          </>
        )}
      </div>
    </div>
  );
}
