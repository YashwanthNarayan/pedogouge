// y-websocket server with Supabase JWT auth + room ACL
// Full implementation: T3-07
// See plan P.10 for security requirements (JWT re-auth, read-only teachers, size caps)

import { WebSocketServer } from "ws";
import { setupWSConnection } from "y-websocket/bin/utils";
import { createClient } from "@supabase/supabase-js";

const PORT = process.env.PORT ?? 3000;
const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", async (conn, req) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    const roomName = url.pathname.slice(1);

    if (!token) {
      conn.close(4001, "missing token");
      return;
    }

    // T3-07: implement Supabase JWT validation + room ACL here
    // For now: log and accept (stub)
    console.log(`[yws] connection to room ${roomName} (auth: T3-07 stub)`);

    setupWSConnection(conn, req, { docName: roomName, gc: true });
  } catch (err) {
    console.error("[yws] error:", err);
    conn.close(4001, "auth failed");
  }
});

console.log(`[yws] listening on :${PORT}`);
