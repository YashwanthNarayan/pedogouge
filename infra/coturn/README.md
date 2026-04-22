# Coturn TURN Server

Handles WebRTC NAT traversal for the Pedagogue voice defense.
Runs on the same DigitalOcean droplet as Judge0 (T3-03).

## Quick setup

```bash
# 1. SSH into the droplet
ssh root@<DROPLET_IP>

# 2. Clone repo or copy infra/coturn/ to the droplet
# 3. Run setup script (generates TLS cert + installs + starts coturn)
./setup.sh <DROPLET_IP> <DOMAIN> <COTURN_SECRET>

# Example:
./setup.sh 1.2.3.4 turn.pedagogue.app $(openssl rand -hex 32)
```

## DO firewall rules to open

| Port range       | Protocol | Purpose                  |
|------------------|----------|--------------------------|
| 3478             | UDP      | STUN/TURN                |
| 3478             | TCP      | TURN over TCP            |
| 5349             | TCP      | TURN over TLS            |
| 49152–65535      | UDP      | WebRTC relay (media)     |

Add these in **DigitalOcean → Networking → Firewalls → Inbound Rules**.

## Generating COTURN_SECRET

```bash
openssl rand -hex 32
```

Store the output in:
- `.env.local` as `COTURN_SECRET=<value>`
- Vercel env as `COTURN_SECRET=<value>`
- The droplet: passed to `setup.sh` at deploy time

## Wiring into the defense WebSocket server

Set these env vars on the defense-ws Fly app:

```
COTURN_SECRET=<same value as turnserver.conf>
COTURN_URL=<droplet IP or domain>
```

The defense-ws server calls `generate-credentials.ts` logic to mint
time-limited (24h) TURN credentials per session using HMAC-SHA1.

## Wiring into the defense page (browser)

Set in Vercel:

```
NEXT_PUBLIC_COTURN_URL=turn:<DROPLET_IP_OR_DOMAIN>:3478
```

The defense page passes this as an `iceServer` config to `RTCPeerConnection`.

## Testing the TURN server

```bash
# Install coturn utils (same package)
apt-get install coturn

# Test UDP relay
turnutils_uclient -T -u test -w <COTURN_SECRET> <DROPLET_IP>

# Test TLS relay
turnutils_uclient -S -T -u test -w <COTURN_SECRET> <DOMAIN>
```

## Certificate renewal

Certbot auto-renews via a systemd timer. Coturn reloads automatically
on renewal via the certbot deploy hook. No manual action needed.
