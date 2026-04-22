"use client";

import { useState, useEffect, useRef, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { Transcript, type TranscriptTurn } from "@/components/defense/transcript";
import { PhaseIndicator, type DefensePhase } from "@/components/defense/phase-indicator";
import { BugPreview } from "@/components/defense/bug-preview";
import { AudioIn } from "@/components/defense/audio-in";
import { AudioOut } from "@/components/defense/audio-out";
import { DefenseConnection, type ServerMessage } from "@/components/defense/connection";

// ---------------------------------------------------------------------------
// Defense page component
// ---------------------------------------------------------------------------

interface DefensePageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ teacher?: string }>;
}

export default function DefensePage({ params, searchParams }: DefensePageProps) {
  const router = useRouter();
  const { id: sessionId } = use(params);
  const resolvedSearch = searchParams ? use(searchParams) : undefined;
  const isTeacherView = resolvedSearch?.teacher === "true";

  // State
  const [consentChecked, setConsentChecked] = useState(false);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [phase, setPhase] = useState<DefensePhase>("blueprint_interrogation");
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [claudeSpeaking, setClaudeSpeaking] = useState(false);
  const [claudeLiveText, setClaudeLiveText] = useState("");   // aria-live accumulator
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const defenseStartTs = useRef(Date.now());

  // Refs for audio pipeline
  const audioInRef = useRef<AudioIn | null>(null);
  const audioOutRef = useRef<AudioOut | null>(null);
  const connectionRef = useRef<DefenseConnection | null>(null);

  // ---------------------------------------------------------------------------
  // Server message handler
  // ---------------------------------------------------------------------------
  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.kind) {
      case "tts_start":
        setClaudeSpeaking(true);
        setClaudeLiveText("");    // reset accumulator for this turn
        audioOutRef.current?.onTTSStart();
        break;

      case "tts_audio":
        if (msg.data) {
          audioOutRef.current?.appendChunk(msg.data);
        }
        break;

      case "tts_stop":
        setClaudeSpeaking(false);
        audioOutRef.current?.stop();
        break;

      case "transcript_user":
        if (msg.data) {
          setTurns((prev) => [...prev, { role: "user", text: msg.data!, ts: Date.now() }]);
        }
        break;

      case "transcript_claude":
        if (msg.data) {
          setClaudeSpeaking(false);
          setClaudeLiveText(msg.data);   // aria-live picks this up
          setTurns((prev) => [...prev, { role: "claude", text: msg.data!, ts: Date.now() }]);
        }
        break;

      case "phase_advance":
        if (msg.phase) {
          setPhase(msg.phase as DefensePhase);
          if (msg.phase === "complete") {
            endDefense();
          }
        }
        break;

      case "error":
        setErrorMsg(msg.error ?? "An error occurred in the defense pipeline.");
        break;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Barge-in: user speaks while Claude TTS plays
  // ---------------------------------------------------------------------------
  const handleSpeechStart = useCallback(() => {
    setIsSpeaking(true);
    if (claudeSpeaking) {
      audioOutRef.current?.stop();
    }
    connectionRef.current?.send("vad_speech_start");
  }, [claudeSpeaking]);

  const handleSpeechEnd = useCallback(() => {
    setIsSpeaking(false);
    connectionRef.current?.send("vad_speech_end");
  }, []);

  // ---------------------------------------------------------------------------
  // Mute / unmute mic
  // ---------------------------------------------------------------------------
  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      audioInRef.current?.setMuted(next);
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!started) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when user is typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;

      if (e.code === "Space") {
        e.preventDefault();
        toggleMute();
      } else if (e.code === "Escape") {
        e.preventDefault();
        endDefense();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [started, toggleMute]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Start defense
  // ---------------------------------------------------------------------------
  const startDefense = useCallback(async () => {
    if (!consentChecked && !isTeacherView) return;
    setStarted(true);
    setConnectionStatus("connecting");
    defenseStartTs.current = Date.now();

    try {
      const tokenRes = await fetch(`/api/defense/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      let wsUrl = process.env.NEXT_PUBLIC_DEFENSE_WS_URL ?? "wss://pedagogue-defense.fly.dev";
      let roomToken = "dev-token";

      if (tokenRes.ok) {
        const data = await tokenRes.json() as { token: string; wsUrl?: string };
        roomToken = data.token;
        if (data.wsUrl) wsUrl = data.wsUrl;
      } else if (process.env.NEXT_PUBLIC_DEFENSE_MOCK !== "true") {
        throw new Error("Failed to get defense token");
      }

      // Teacher view: connect read-only, no mic
      if (isTeacherView) {
        connectionRef.current = new DefenseConnection({
          wsUrl,
          roomToken,
          onMessage: handleServerMessage,
          onOpen: () => setConnectionStatus("connected"),
          onClose: () => setConnectionStatus("idle"),
          onError: () => {
            setConnectionStatus("error");
            setErrorMsg("Failed to connect.");
          },
        });
        connectionRef.current.connect();
        return;
      }

      // Initialize audio output (requires user gesture)
      audioOutRef.current = new AudioOut({
        onPlaybackStart: () => setClaudeSpeaking(true),
        onPlaybackEnd: () => setClaudeSpeaking(false),
        onError: (err) => console.error("[audio-out]", err),
      });
      audioOutRef.current.init();

      connectionRef.current = new DefenseConnection({
        wsUrl,
        roomToken,
        onMessage: handleServerMessage,
        onOpen: () => setConnectionStatus("connected"),
        onClose: (code, reason) => {
          if (code !== 1000) {
            setConnectionStatus("error");
            setErrorMsg(`Disconnected: ${reason || "unknown reason"}`);
          }
        },
        onError: () => {
          setConnectionStatus("error");
          setErrorMsg("Failed to connect to defense server.");
        },
      });
      connectionRef.current.connect();

      audioInRef.current = new AudioIn({
        onChunk: (base64) => connectionRef.current?.sendAudio(base64),
        onSpeechStart: handleSpeechStart,
        onSpeechEnd: handleSpeechEnd,
        onError: (err) => {
          setErrorMsg(`Microphone error: ${err.message}`);
        },
      });
      await audioInRef.current.start();

    } catch (err) {
      setConnectionStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to start defense.");
      setStarted(false);
    }
  }, [consentChecked, sessionId, isTeacherView, handleServerMessage, handleSpeechStart, handleSpeechEnd]);

  // ---------------------------------------------------------------------------
  // End defense
  // ---------------------------------------------------------------------------
  const endDefense = useCallback(() => {
    connectionRef.current?.send("end");
    connectionRef.current?.close();
    audioInRef.current?.stop();
    audioOutRef.current?.destroy();
    router.push(`/session/${sessionId}/defense/complete`);
  }, [router, sessionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      connectionRef.current?.close();
      audioInRef.current?.stop();
      audioOutRef.current?.destroy();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950">
      {/* Hidden aria-live region — screen readers announce Claude's speech */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="sr-only"
      >
        {claudeLiveText}
      </div>

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-800">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isTeacherView ? "Defense Interview (Observer)" : "Defense Interview"}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {isTeacherView ? "Read-only teacher view" : (
              started
                ? "Space = mute/unmute · Esc = end"
                : "Voice-based defense interview"
            )}
          </p>
        </div>

        <PhaseIndicator currentPhase={phase} />
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Transcript */}
        <div className="flex flex-col flex-1 min-w-0">
          <Transcript turns={turns} defenseStartTs={defenseStartTs.current} />
        </div>

        {/* Bug preview panel (appears during Phase 2 when inject_bug fires) */}
        {phase === "bug_injection" && started && (
          <BugPreview sessionId={sessionId} />
        )}

        {/* Mic orb + controls sidebar */}
        <div className="w-72 border-l dark:border-gray-800 flex flex-col items-center justify-center gap-8 p-6">

          {!started ? (
            /* Pre-flight */
            <div className="flex flex-col gap-4 w-full">
              {isTeacherView ? (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    You are observing this defense session as a teacher. The microphone is disabled.
                  </p>
                  <button
                    onClick={startDefense}
                    className="w-full py-2.5 px-4 rounded-lg bg-blue-600 text-white font-medium text-sm
                      hover:bg-blue-700 transition-colors"
                  >
                    Connect as Observer
                  </button>
                </>
              ) : (
                <>
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                    <p className="font-medium text-gray-900 dark:text-gray-100">Voice Recording Consent</p>
                    <p>Your voice will be recorded during this interview and stored for up to 30 days to generate your credential.</p>
                    <a href="/defense/text-only" className="text-blue-600 underline text-xs">
                      Prefer text-only defense?
                    </a>
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentChecked}
                      onChange={(e) => setConsentChecked(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      I consent to voice recording for this defense session.
                    </span>
                  </label>

                  {errorMsg && (
                    <p className="text-red-600 text-sm" role="alert">{errorMsg}</p>
                  )}

                  <button
                    onClick={startDefense}
                    disabled={!consentChecked}
                    className="w-full py-2.5 px-4 rounded-lg bg-blue-600 text-white font-medium text-sm
                      disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
                  >
                    {connectionStatus === "connecting" ? "Connecting..." : "Start Defense"}
                  </button>
                </>
              )}
            </div>
          ) : (
            /* Active defense: mic orb + controls */
            <div className="flex flex-col items-center gap-6 w-full">
              {/* Mic orb */}
              <button
                type="button"
                onClick={isTeacherView ? undefined : toggleMute}
                disabled={isTeacherView}
                aria-label={
                  isTeacherView
                    ? "Microphone disabled (observer mode)"
                    : muted
                      ? "Unmute microphone (Space)"
                      : claudeSpeaking
                        ? "Interviewer is speaking"
                        : isSpeaking
                          ? "You are speaking"
                          : "Mute microphone (Space)"
                }
                className={[
                  "w-24 h-24 rounded-full flex items-center justify-center",
                  "transition-all duration-200 focus-visible:outline focus-visible:outline-2",
                  "focus-visible:outline-offset-4 focus-visible:outline-blue-600",
                  isTeacherView || muted
                    ? "bg-gray-300 dark:bg-gray-600 cursor-default"
                    : claudeSpeaking
                      ? "bg-purple-500 shadow-lg shadow-purple-500/40 scale-110 animate-pulse cursor-pointer"
                      : isSpeaking
                        ? "bg-blue-500 shadow-lg shadow-blue-500/40 scale-105 cursor-pointer"
                        : "bg-gray-200 dark:bg-gray-700 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600",
                ].join(" ")}
              >
                {muted ? (
                  /* Muted mic icon */
                  <svg className="w-10 h-10 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
                  </svg>
                ) : (
                  /* Normal mic icon */
                  <svg
                    className={`w-10 h-10 ${claudeSpeaking || isSpeaking ? "text-white" : "text-gray-400"}`}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                )}
              </button>

              {/* Status text */}
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {isTeacherView
                    ? "Observer mode — audio only"
                    : muted
                      ? "Muted — press Space to unmute"
                      : claudeSpeaking
                        ? "Interviewer speaking..."
                        : isSpeaking
                          ? "Listening..."
                          : "Ready — speak your answer"}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {connectionStatus === "connected"
                    ? "● Connected"
                    : connectionStatus === "error"
                      ? "⚠ Disconnected"
                      : "Connecting..."}
                </p>
              </div>

              {errorMsg && (
                <p className="text-red-600 text-sm text-center" role="alert">{errorMsg}</p>
              )}

              {/* End defense button */}
              {!isTeacherView && (
                <button
                  onClick={endDefense}
                  className="w-full py-2.5 px-4 rounded-lg border border-red-300 text-red-600
                    text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950 transition-colors
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
                >
                  End Defense
                </button>
              )}

              {/* Keyboard hint */}
              {!isTeacherView && (
                <p className="text-xs text-gray-400 text-center">
                  Space to mute · Esc to end
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
