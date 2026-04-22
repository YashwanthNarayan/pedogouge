import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

// Matches the shape produced by P3 T3-18 and the demo stub in page.tsx
interface RadarEntry {
  subject: string;
  value: number;
}

interface CredentialSubject {
  projectTitle: string;
  competencyRadar?: Record<string, number>;
  conceptsDemonstrated?: Array<{ name: string; masteryScore: number }>;
}

interface WC3Credential {
  credentialSubject: CredentialSubject;
}

async function fetchCredential(
  id: string,
  baseUrl: string
): Promise<WC3Credential | null> {
  try {
    // Hit the same page route that CredentialPage uses; in production P3 will
    // expose a lightweight /api/credential/:id/json endpoint — for now we try
    // the page's server data by calling our own API.
    const res = await fetch(`${baseUrl}/api/credential/${id}/json`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as WC3Credential;
  } catch {
    return null;
  }
}

function radarSummary(radar: Record<string, number>): RadarEntry[] {
  return Object.entries(radar)
    .map(([key, value]) => ({
      subject: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase()),
      value: Math.round(value * 100),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

function scoreColor(v: number): string {
  if (v >= 75) return "#16a34a";
  if (v >= 50) return "#d97706";
  return "#dc2626";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const baseUrl = new URL(req.url).origin;
  const cred = await fetchCredential(id, baseUrl);

  const title = cred?.credentialSubject.projectTitle ?? "Pedagogue Credential";
  const radar = cred?.credentialSubject.competencyRadar
    ? radarSummary(cred.credentialSubject.competencyRadar)
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
          padding: "48px 56px",
          fontFamily: "system-ui, sans-serif",
          color: "#ffffff",
        }}
      >
        {/* Top label */}
        <div
          style={{
            fontSize: 16,
            opacity: 0.75,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          Pedagogue · Verified Learning Credential
        </div>

        {/* Project title */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 1.1,
            marginBottom: 32,
            maxWidth: 820,
          }}
        >
          {title}
        </div>

        {/* Radar summary bars */}
        {radar && radar.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              flex: 1,
              justifyContent: "center",
            }}
          >
            {radar.map((entry) => (
              <div
                key={entry.subject}
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <div
                  style={{
                    width: 180,
                    fontSize: 14,
                    opacity: 0.9,
                    flexShrink: 0,
                  }}
                >
                  {entry.subject}
                </div>
                <div
                  style={{
                    flex: 1,
                    height: 8,
                    background: "rgba(255,255,255,0.2)",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${entry.value}%`,
                      height: "100%",
                      background: scoreColor(entry.value),
                      borderRadius: 4,
                    }}
                  />
                </div>
                <div
                  style={{
                    width: 36,
                    fontSize: 13,
                    fontWeight: 600,
                    textAlign: "right",
                    opacity: 0.9,
                  }}
                >
                  {entry.value}%
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 32,
            paddingTop: 20,
            borderTop: "1px solid rgba(255,255,255,0.25)",
          }}
        >
          <div style={{ fontSize: 15, opacity: 0.8 }}>
            pedagogue.app/credential/{id.slice(0, 8)}…
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.15)",
              borderRadius: 20,
              padding: "6px 16px",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Verified by Pedagogue
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
