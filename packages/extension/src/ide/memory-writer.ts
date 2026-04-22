import { BackendClient } from "../backend/client";

export async function writeSessionMemory(
  sessionId: string,
  backendClient: BackendClient,
): Promise<void> {
  try {
    await backendClient.request("/api/memory/write", {
      method: "POST",
      body: {
        sessionId,
        userId: "",               // backend derives from auth token
        entries: [{ key: "session_end", value: new Date().toISOString() }],
      },
    });
    console.log("[Pedagogue] Session memory written");
  } catch (err) {
    console.error("[Pedagogue] Failed to write session memory:", (err as Error).message);
  }
}
