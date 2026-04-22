# /freeze-contract <file> — Lock a shared schema and ping the team

Use when you want to mark a packages/shared/ file as frozen (no changes without 2-person approval).

Steps:
1. Read the specified file and summarize what's changing
2. Create a git commit: `chore(shared): freeze contract {filename}`
3. Open a PR with label `contract-change` if gh CLI is available
4. Output a Slack-paste block:

---
🔒 CONTRACT FREEZE: {filename}

Changes:
{bullet summary of what changed}

Impact:
- P1 (extension): {what they need to update}
- P2 (AI/voice): {what they need to update}
- P3 (infra/backend): {what they need to update}

This PR requires 2 approvals before merge.
PR: {url or "create manually"}
---

After freeze, update CLAUDE.md "Integration contracts" section if needed.
