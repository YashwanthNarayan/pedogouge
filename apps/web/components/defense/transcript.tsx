"use client";

import { useEffect, useRef } from "react";

export interface TranscriptTurn {
  role: "user" | "claude";
  text: string;
  ts: number;
}

interface TranscriptProps {
  turns: TranscriptTurn[];
  defenseStartTs: number;
}

function formatOffset(ts: number, startTs: number): string {
  const seconds = Math.floor((ts - startTs) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Transcript({ turns, defenseStartTs }: TranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new turns
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length]);

  if (turns.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Waiting for the defense to begin...
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto space-y-3 px-4 py-2"
      aria-live="polite"
      aria-label="Defense transcript"
    >
      {turns.map((turn, i) => (
        <div
          key={i}
          className={`flex flex-col ${turn.role === "user" ? "items-end" : "items-start"}`}
        >
          <div
            className={`
              max-w-[75%] rounded-2xl px-4 py-2 text-sm
              ${turn.role === "user"
                ? "bg-blue-600 text-white rounded-br-sm"
                : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm"}
            `}
          >
            {turn.text}
          </div>
          <span className="text-xs text-gray-400 mt-1 px-1">
            {turn.role === "user" ? "You" : "Interviewer"} ·{" "}
            {formatOffset(turn.ts, defenseStartTs)}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
