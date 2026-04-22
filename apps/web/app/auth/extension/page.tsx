"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ExtensionAuthInner() {
  const params = useSearchParams();
  const state = params.get("state") ?? "";
  const challenge = params.get("challenge") ?? "";

  const disabled = !state || !challenge;

  function handleSignIn() {
    const redirectUri = `${window.location.origin}/api/auth/callback/github`;
    const scope = "read:user user:email";
    const ghUrl = new URL("https://github.com/login/oauth/authorize");
    ghUrl.searchParams.set("client_id", process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ?? "");
    ghUrl.searchParams.set("redirect_uri", redirectUri);
    ghUrl.searchParams.set("scope", scope);
    ghUrl.searchParams.set("state", state);
    // Forward PKCE challenge so callback can store it
    ghUrl.searchParams.set("code_challenge", challenge);
    ghUrl.searchParams.set("code_challenge_method", "S256");
    window.location.href = ghUrl.toString();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 text-white p-8">
      <div className="text-4xl">🎓</div>
      <h1 className="text-2xl font-semibold tracking-tight">Connecting VS Code…</h1>
      <p className="text-sm text-zinc-400 max-w-xs text-center">
        Sign in with GitHub to link your Pedagogue account to the VS Code extension.
      </p>

      {disabled && (
        <p className="text-xs text-red-400">
          Missing OAuth parameters. Please re-run the sign-in command in VS Code.
        </p>
      )}

      <button
        onClick={handleSignIn}
        disabled={disabled}
        className="flex items-center gap-2 rounded-lg bg-white text-zinc-900 px-5 py-2.5 text-sm font-medium
                   hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors"
      >
        <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38
                   0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
                   -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
                   .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
                   -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.64 7.64 0 012-.27 7.64
                   7.64 0 012 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82
                   1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01
                   1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        Sign in with GitHub
      </button>

      <p className="text-xs text-zinc-500">
        You will be redirected back to VS Code after sign-in.
      </p>
    </main>
  );
}

export default function ExtensionAuthPage() {
  return (
    <Suspense>
      <ExtensionAuthInner />
    </Suspense>
  );
}
