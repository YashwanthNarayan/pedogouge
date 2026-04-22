# ADR 002 — Ed25519 for Credential Signing (not HMAC)

**Status:** Accepted  
**Date:** 2026-04-21

## Context

The original plan used HMAC-SHA256 for credential signing. HMAC requires the verifier to hold the shared secret — meaning only we can verify. That defeats the purpose of a verifiable credential (employers/colleges should be able to verify without calling our API).

## Decision

Use Ed25519 (asymmetric) via the `jose` library:
- Private key in Vercel env only (`CREDENTIAL_ED25519_PRIVATE_KEY`), never leaves backend
- Public key published at `GET /.well-known/jwks.json` with `kid`
- Credential proof type: `Ed25519Signature2026`
- JWS over JCS-canonicalized `credentialSubject`
- HMAC retained as a secondary `/verify` fallback for backward compatibility

## Consequences

- Any third party (employer, college) can verify using the JWKS — no shared secret needed
- Key rotation: add new `kid` to JWKS; old credentials still verify against old kid
- Revocation: `StatusList2021` bitstring at `GET /.well-known/credentials-revocation-list.json`
- `jose` package adds ~50KB to the web bundle — acceptable
