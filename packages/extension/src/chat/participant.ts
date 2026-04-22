import * as vscode from "vscode";
import { BackendClient } from "../backend/client";
import { slashHandlers } from "./slash-commands";

const MOCK_CHAT = process.env.PEDAGOGUE_MOCK_CHAT === "true";
const HISTORY_LIMIT = 10;

function buildHistory(
  context: vscode.ChatContext,
): Array<{ role: "user" | "assistant"; content: string }> {
  return context.history.slice(-HISTORY_LIMIT).flatMap(
    (turn): Array<{ role: "user" | "assistant"; content: string }> => {
      if (turn instanceof vscode.ChatRequestTurn) {
        return [{ role: "user", content: turn.prompt }];
      }
      if (turn instanceof vscode.ChatResponseTurn) {
        const text = turn.response
          .filter((p): p is vscode.ChatResponseMarkdownPart => p instanceof vscode.ChatResponseMarkdownPart)
          .map((p) => p.value.value)
          .join("");
        return text ? [{ role: "assistant", content: text }] : [];
      }
      return [];
    },
  );
}

function abortSignalFromToken(token: vscode.CancellationToken): AbortSignal {
  const controller = new AbortController();
  token.onCancellationRequested(() => controller.abort());
  return controller.signal;
}

async function mockStream(stream: vscode.ChatResponseStream, message: string): Promise<void> {
  const reply = `**@tutor** *(mock mode)*\n\nYou asked: \`${message}\`\n\nHere's a pedagogical hint: think about what each line does step by step.`;
  for (let i = 0; i < reply.length; i += 20) {
    await new Promise((r) => setTimeout(r, 50));
    stream.markdown(reply.slice(i, i + 20));
  }
}

export function createParticipantHandler(
  secrets: vscode.SecretStorage,
  getSessionId: () => string | undefined,
) {
  const client = new BackendClient(secrets);

  return async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatResult> => {
    // Check auth for non-mock mode
    if (!MOCK_CHAT) {
      const sessionToken = await secrets.get("pedagogue.sessionToken");
      if (!sessionToken) {
        stream.markdown("You need to sign in to use @tutor.");
        stream.button({ command: "pedagogue.signIn", title: "Sign In" });
        return {};
      }
    }

    // Handle slash commands
    const slashHandler = request.command ? slashHandlers[request.command] : undefined;
    if (slashHandler) {
      await slashHandler(request, context, stream, token, client, getSessionId());
      return {};
    }

    // Handle plain message
    if (MOCK_CHAT) {
      await mockStream(stream, request.prompt);
      return {};
    }

    const sessionId = getSessionId();
    const history = buildHistory(context);
    const signal = abortSignalFromToken(token);

    try {
      for await (const chunk of client.streamSSE(
        "/api/chat",
        { sessionId, message: request.prompt, history },
        signal,
      )) {
        if (token.isCancellationRequested) break;
        stream.markdown(chunk);
      }
    } catch (err) {
      if (err && typeof err === "object" && "status" in err) {
        const e = err as { status: number; retryAfter?: number };
        if (e.status === 401) {
          stream.markdown("Your session has expired. Please sign in again.");
          stream.button({ command: "pedagogue.signIn", title: "Sign In" });
          return {};
        }
        if (e.status === 429) {
          stream.markdown(`Rate limit reached. Please wait ${e.retryAfter ?? 60} seconds.`);
          return {};
        }
      }
      if ((err as { name?: string }).name !== "AbortError") {
        stream.markdown("Failed to reach the Pedagogue backend. Please check your connection.");
      }
    }

    return {};
  };
}
