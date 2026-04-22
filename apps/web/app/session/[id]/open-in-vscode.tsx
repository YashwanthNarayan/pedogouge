"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function OpenInVSCode({ sessionId }: { sessionId: string }) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    // Build deep-link once the Supabase session is available client-side
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token ?? "";
      const params = new URLSearchParams({ sessionId });
      if (token) params.set("token", token);
      setHref(`vscode://pedagogue-tutor/connect?${params.toString()}`);
    });
  }, [sessionId]);

  if (!href) {
    // Render a placeholder with the same dimensions to avoid layout shift
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          background: "#e5e7eb",
          color: "#9ca3af",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          minWidth: 160,
        }}
      >
        <span>⟩_</span> Open in VS Code
      </div>
    );
  }

  return (
    <a
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        background: "#007acc",
        color: "#fff",
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        textDecoration: "none",
      }}
    >
      <span>⟩_</span> Open in VS Code →
    </a>
  );
}
