import * as vscode from "vscode";
import type { BackendClient } from "../backend/client";

export type SlashCommandHandler = (
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  client: BackendClient,
  sessionId: string | undefined,
) => Promise<void>;

export const slashHandlers: Record<string, SlashCommandHandler> = {
  explain: async (request, _ctx, stream, cancellationToken, client, sessionId) => {
    if (!sessionId) {
      stream.markdown("Please set up a project first (`Pedagogue: Setup Project`).");
      return;
    }
    const signal = abortSignalFromToken(cancellationToken);
    try {
      for await (const chunk of client.streamSSE("/api/chat/explain", { sessionId, message: request.prompt }, signal)) {
        stream.markdown(chunk);
      }
    } catch (err) {
      handleStreamError(err, stream);
    }
  },

  debug: async (request, _ctx, stream, cancellationToken, client, sessionId) => {
    if (!sessionId) {
      stream.markdown("Please set up a project first.");
      return;
    }
    const signal = abortSignalFromToken(cancellationToken);
    try {
      for await (const chunk of client.streamSSE("/api/chat/debug", { sessionId, message: request.prompt }, signal)) {
        stream.markdown(chunk);
      }
    } catch (err) {
      handleStreamError(err, stream);
    }
  },

  review: async (request, _ctx, stream, cancellationToken, client, sessionId) => {
    if (!sessionId) {
      stream.markdown("Please set up a project first.");
      return;
    }
    const signal = abortSignalFromToken(cancellationToken);
    try {
      for await (const chunk of client.streamSSE("/api/chat/review", { sessionId, message: request.prompt }, signal)) {
        stream.markdown(chunk);
      }
    } catch (err) {
      handleStreamError(err, stream);
    }
  },

  defend: async (_request, _ctx, stream, _token, _client, _sessionId) => {
    stream.markdown("Ready to start your voice defense? Click the button below to open the defense page in your browser.");
    stream.button({
      command: "pedagogue.defend",
      title: "Start Voice Defense",
    });
  },
};

function abortSignalFromToken(token: vscode.CancellationToken): AbortSignal {
  const controller = new AbortController();
  token.onCancellationRequested(() => controller.abort());
  return controller.signal;
}

function handleStreamError(err: unknown, stream: vscode.ChatResponseStream): void {
  if (err && typeof err === "object" && "status" in err) {
    const e = err as { status: number; retryAfter?: number };
    if (e.status === 401) {
      stream.markdown("You need to sign in first.");
      stream.button({ command: "pedagogue.signIn", title: "Sign In" });
      return;
    }
    if (e.status === 429) {
      stream.markdown(`Rate limit reached. Please wait ${e.retryAfter ?? 60}s and try again.`);
      return;
    }
  }
  stream.markdown("Something went wrong. Please try again.");
}
