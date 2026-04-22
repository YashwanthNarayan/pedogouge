import { WebSocketServer } from "ws";
import type { WebSocket, RawData } from "ws";
import type { IncomingMessage } from "http";
// y-websocket ships a CJS utils module; import with require for compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { setupWSConnection } = require("y-websocket/bin/utils") as {
  setupWSConnection: (ws: WebSocket, req: IncomingMessage, opts?: { docName?: string; gc?: boolean }) => void;
};

const port = parseInt(process.env.PORT ?? "4444", 10);
const wss = new WebSocketServer({ port });

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  // Optional auth: check ?token= query param against SUPABASE_JWT_SECRET
  // For now: allow all connections (extension sends its session token alongside room name)
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const roomName = url.pathname.slice(1) || "default";

  setupWSConnection(ws, req, { docName: roomName, gc: true });
});

console.log(`y-websocket running on :${port}`);
