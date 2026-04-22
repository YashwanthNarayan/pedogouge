import { WebSocketServer } from "ws";
import { handleConnection } from "./server.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws, req) => {
  handleConnection(ws, req).catch((err) => {
    console.error("[index] Unhandled connection error:", err);
    try {
      ws.close(1011, "Internal server error");
    } catch { /* already closed */ }
  });
});

wss.on("error", (err) => {
  console.error("[index] WebSocketServer error:", err);
});

console.log(`[defense-ws] listening on :${PORT}`);
