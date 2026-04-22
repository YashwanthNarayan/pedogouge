# ADR 001 — VS Code Extension as Primary Student Surface

**Status:** Accepted  
**Date:** 2026-04-21

## Context

Students need real IDE integration, not a toy web editor. We need to intercept keystrokes, parse AST on every save, narrate stderr, and inject bugs into their actual files. A web-based IDE would require building a full editor from scratch.

## Decision

The VS Code extension is the primary student surface. It uses the Chat Participant API (`@tutor`), `DiagnosticCollection`, `Pseudoterminal`, `DebugAdapterTrackerFactory`, `NotebookController`, and `workspace.applyEdit` — all native VS Code APIs.

The web dashboard handles: credentials, teacher view, voice defense UI, and the public credential page.

## Consequences

- Extensions require sideloading for demo (Marketplace review takes weeks). We ship a signed `.vsix`.
- Extension host runs Node (CommonJS); the shared package uses ESM — hence separate tsconfig per package.
- Tree-sitter WASM grammars must be bundled into the `.vsix` (integrity-checked per plan P.11).
- No iOS/Android native IDE integration — mobile is read-only (credentials + SM-2).
