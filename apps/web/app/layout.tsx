import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pedagogue — AI Coding Tutor",
  description:
    "Closed-loop AI pedagogical system with cryptographically-verifiable learning credentials.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
