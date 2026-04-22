# ADR 005 — Self-Hosted Judge0 over RapidAPI Public CE

**Status:** Accepted  
**Date:** 2026-04-21

## Context

Code execution is required for: running student tests, verifying assignment acceptance criteria, and the live bug-injection demo in voice defense Phase 2. Options considered:

1. **RapidAPI Judge0 CE** (public free tier) — no setup, rate-limited, ~3s webhook delay, shared infrastructure, no multi-file support in free tier
2. **Self-hosted Judge0 CE + Extra CE** on a dedicated VM — full control, isolate sandbox (same as IOI), faster webhooks, multi-file via `language_id=89` + zip

## Decision

Self-host Judge0 on a DigitalOcean droplet (4 vCPU / 8 GB / 80 GB, Ubuntu 22.04). Run both CE (standard) and Extra CE (extended language set including Python 3.11+ and Node 20+) via Docker Compose.

Key reasons:
- **Demo reliability**: shared tier can be overloaded; demo day needs deterministic < 5s execution
- **Multi-file**: `language_id=89` + base64 zip allows entire project workspaces, not just single files
- **Isolate sandbox**: `ioi/isolate` gives kernel namespaces + cgroups — real isolation, not Docker-only
- **Webhook latency**: self-hosted webhooks arrive in ~300ms vs ~3s on shared tier

## Consequences

- DO droplet cost: ~$48/month (demo budget acceptable)
- VM is a dedicated execution host: no other services except Coturn (TURN server, shares infra cheaply)
- Firewall restricts port 443 to Vercel egress CIDR only; SSH from bastion only; Judge0 admin UI not exposed
- `JUDGE0_FALLBACK_URL` + `JUDGE0_FALLBACK_RAPIDAPI_KEY` env vars kept as hot fallback behind a feature flag
- Webhook HMAC (`JUDGE0_CALLBACK_SECRET`) required on every callback; 30s freshness window enforced
- Resource limits: 10s CPU, 256MB RAM, 64MB storage, network disabled for student code
- Maintenance: auto-updates disabled; pinned Judge0 version in docker-compose.yml
