import Link from "next/link";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

async function getLatestSession(): Promise<{ userId: string; sessionId: string | null } | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      },
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    const { data: latestSession } = await supabase
      .from("sessions")
      .select("id")
      .eq("user_id", session.user.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return { userId: session.user.id, sessionId: latestSession?.id ?? null };
  } catch {
    return null;
  }
}

const FEATURES = [
  {
    icon: "⚡",
    title: "Live diagnostics",
    desc: "Tree-sitter analysis on every keystroke catches conceptual gaps before they compound.",
  },
  {
    icon: "🎙",
    title: "Voice defense",
    desc: "A 3-phase oral exam with real-time TTS confirms you understand what you built, not just that it runs.",
  },
  {
    icon: "🏅",
    title: "Verified credentials",
    desc: "Ed25519-signed W3C Verifiable Credentials — scannable QR codes anyone can verify without trusting us.",
  },
  {
    icon: "👩‍🏫",
    title: "Teacher dashboard",
    desc: "Live mastery graphs, intervention history, and nudge tools for every student in the class.",
  },
];

export default async function LandingPage() {
  const userData = await getLatestSession();
  const isSignedIn = userData !== null;
  const latestSessionId = userData?.sessionId ?? null;

  return (
    <main
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: "#f8fafc",
        background: "#0f172a",
        minHeight: "100vh",
      }}
    >
      {/* Nav */}
      <nav
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#f8fafc",
            letterSpacing: "-0.01em",
          }}
        >
          Pedagogue
        </span>
        {isSignedIn ? (
          <Link
            href="/session/new"
            style={{
              padding: "6px 14px",
              background: "#1d4ed8",
              color: "#fff",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            New project
          </Link>
        ) : (
          <Link
            href="/auth/signin"
            style={{
              padding: "6px 14px",
              background: "#1e293b",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Sign in
          </Link>
        )}
      </nav>

      {/* Hero */}
      <section
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "80px 24px 64px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 24,
            padding: "4px 14px",
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            color: "#a5b4fc",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          AI tutor + VS Code + voice defense
        </div>

        <h1
          style={{
            margin: "0 0 20px",
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            color: "#f8fafc",
          }}
        >
          Learn by building.{" "}
          <span style={{ color: "#818cf8" }}>Prove it with a credential.</span>
        </h1>

        <p
          style={{
            margin: "0 0 40px",
            fontSize: 18,
            color: "#94a3b8",
            lineHeight: 1.65,
            maxWidth: 560,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Pedagogue lives in VS Code, watches how you learn, and issues a
          cryptographically-verifiable credential when you pass the voice defense.
        </p>

        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {isSignedIn && latestSessionId ? (
            <Link
              href={`/session/${latestSessionId}`}
              style={{
                padding: "14px 28px",
                background: "#1d4ed8",
                color: "#fff",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Continue your project →
            </Link>
          ) : (
            <Link
              href="/session/new"
              style={{
                padding: "14px 28px",
                background: "#1d4ed8",
                color: "#fff",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Start a project →
            </Link>
          )}
          <Link
            href="/verify"
            style={{
              padding: "14px 28px",
              background: "transparent",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            View a credential →
          </Link>
        </div>

        {isSignedIn && !latestSessionId && (
          <div style={{ marginTop: 16 }}>
            <Link
              href="/session/new"
              style={{
                fontSize: 14,
                color: "#64748b",
                textDecoration: "underline",
              }}
            >
              No sessions yet — start your first project
            </Link>
          </div>
        )}
      </section>

      {/* Feature cards */}
      <section
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "0 24px 80px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: 10,
                padding: "20px 20px 22px",
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 10 }}>{f.icon}</div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#e2e8f0",
                  marginBottom: 6,
                }}
              >
                {f.title}
              </div>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
