"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const LANGUAGES = ["Python", "JavaScript", "TypeScript", "Java", "C"] as const;
type Language = (typeof LANGUAGES)[number];

export function IntakeForm() {
  const router = useRouter();
  const [projectIdea, setProjectIdea] = useState("");
  const [studentName, setStudentName] = useState("");
  const [language, setLanguage] = useState<Language>("Python");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (projectIdea.length < 50) {
      setError("Please describe your project in at least 50 characters.");
      return;
    }
    if (projectIdea.length > 500) {
      setError("Please keep your project description under 500 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectIdea, studentName, language }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }

      const { sessionId } = (await res.json()) as { sessionId: string };
      router.push(`/session/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const charCount = projectIdea.length;
  const charOk = charCount >= 50 && charCount <= 500;

  return (
    <main
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        minHeight: "100vh",
        background: "#f9fafb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 600 }}>
        {/* Header */}
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
              padding: "4px 12px",
              background: "#eff6ff",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              color: "#1d4ed8",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Pedagogue
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 30,
              fontWeight: 700,
              color: "#111827",
              lineHeight: 1.2,
            }}
          >
            What are you building today?
          </h1>
          <p
            style={{
              marginTop: 12,
              color: "#6b7280",
              fontSize: 15,
              lineHeight: 1.6,
            }}
          >
            Pedagogue will generate a personalized learning plan and watch your progress
            as you code. At the end, you&apos;ll earn a verifiable credential.
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            padding: "32px 28px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
          }}
        >
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Project idea */}
            <div>
              <label
                htmlFor="projectIdea"
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
              >
                Project idea <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea
                id="projectIdea"
                value={projectIdea}
                onChange={(e) => setProjectIdea(e.target.value)}
                placeholder="e.g. Build a to-do list app in Python that saves tasks to a file"
                rows={4}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 14,
                  borderRadius: 8,
                  border: `1px solid ${charCount > 0 && !charOk ? "#fca5a5" : "#d1d5db"}`,
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  color: "#111827",
                  background: loading ? "#f9fafb" : "#fff",
                  transition: "border-color 0.15s",
                }}
              />
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: charCount > 0 && !charOk ? "#ef4444" : "#9ca3af",
                  textAlign: "right",
                }}
              >
                {charCount}/500{charCount < 50 && charCount > 0 ? ` (${50 - charCount} more needed)` : ""}
              </div>
            </div>

            {/* Student name */}
            <div>
              <label
                htmlFor="studentName"
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
              >
                Your name{" "}
                <span style={{ color: "#6b7280", fontWeight: 400 }}>(for the credential)</span>
              </label>
              <input
                id="studentName"
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Alex Johnson"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 14,
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  color: "#111827",
                  background: loading ? "#f9fafb" : "#fff",
                }}
              />
            </div>

            {/* Language */}
            <div>
              <label
                htmlFor="language"
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
              >
                Programming language
              </label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 14,
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  color: "#111827",
                  background: loading ? "#f9fafb" : "#fff",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#dc2626",
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !projectIdea.trim()}
              style={{
                padding: "12px 24px",
                fontSize: 15,
                fontWeight: 600,
                color: "#fff",
                background: loading || !projectIdea.trim() ? "#9ca3af" : "#1d4ed8",
                border: "none",
                borderRadius: 8,
                cursor: loading || !projectIdea.trim() ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {loading ? "Generating your learning plan… (10–20s)" : "Generate learning plan →"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
