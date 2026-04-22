"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.64 7.64 0 012-.27 7.64 7.64 0 012 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default function SignInPage() {
  const router = useRouter();

  // Redirect already-signed-in users
  useEffect(() => {
    getSupabase().auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/session/new");
    });
  }, [router]);

  async function handleSignIn() {
    await getSupabase().auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "read:user user:email",
      },
    });
  }

  return (
    <main
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        minHeight: "100vh",
        background: "#0f172a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          textAlign: "center",
        }}
      >
        {/* Logo badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 24,
            padding: "4px 14px",
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            color: "#a5b4fc",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Pedagogue
        </div>

        <h1
          style={{
            margin: "0 0 12px",
            fontSize: 28,
            fontWeight: 700,
            color: "#f8fafc",
            lineHeight: 1.2,
          }}
        >
          Sign in to Pedagogue
        </h1>

        <p
          style={{
            margin: "0 0 36px",
            color: "#94a3b8",
            fontSize: 15,
            lineHeight: 1.6,
          }}
        >
          Sign in with your GitHub account to get started.
        </p>

        {/* Card */}
        <div
          style={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 12,
            padding: "28px 24px",
          }}
        >
          <button
            onClick={handleSignIn}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "12px 20px",
              background: "#f8fafc",
              color: "#0f172a",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "#e2e8f0";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "#f8fafc";
            }}
          >
            <GitHubIcon />
            Sign in with GitHub
          </button>
        </div>

        <p
          style={{
            marginTop: 24,
            fontSize: 12,
            color: "#64748b",
            lineHeight: 1.5,
          }}
        >
          By signing in you agree to use Pedagogue for educational purposes only.
          Students must be 16 or older.
        </p>
      </div>
    </main>
  );
}
