/**
 * Generate time-limited TURN credentials using Coturn's REST API algorithm.
 * Usage: COTURN_SECRET=... COTURN_URL=... npx tsx generate-credentials.ts [username]
 *
 * The defense-ws server uses this same logic server-side to mint per-session credentials.
 * The browser never sees COTURN_SECRET — only the derived username + credential pair.
 */
import { createHmac } from "crypto";

const secret = process.env.COTURN_SECRET;
if (!secret) {
  console.error("COTURN_SECRET env var is required");
  process.exit(1);
}

const coturnUrl = process.env.COTURN_URL ?? "localhost";
const ttl = 86_400; // 24h
const timestamp = Math.floor(Date.now() / 1000) + ttl;
const username = `${timestamp}:${process.argv[2] ?? "demo"}`;
const credential = createHmac("sha1", secret).update(username).digest("base64");

console.log(
  JSON.stringify(
    {
      urls: [`turn:${coturnUrl}:3478`],
      username,
      credential,
    },
    null,
    2,
  ),
);
