# /handoff — Generate a handoff summary for a teammate

Generate a structured handoff block from my current branch state. Used when passing work to a teammate.

```bash
export PNPM_HOME="/Users/yashwanth/Library/pnpm"; export PATH="$PNPM_HOME:$PATH"
git log --since=yesterday.00:00 --oneline
git status
git diff --stat main...HEAD
```

Output this exact format (fill in from the above + your task list):

---
HANDOFF: from {P1|P2|P3} to {P1|P2|P3}

Branch: {branch-name}
Last commit: {sha} — {commit-title}

WHAT IS DONE:
- {bullet list of completed parts}

WHAT REMAINS:
- {bullet list of remaining work, each tagged with task ID from the plan}

CONTEXT RECEIVING CLAUDE NEEDS:
- {any decisions that aren't in CLAUDE.md yet — update CLAUDE.md before handoff}
- {gotchas encountered}
- {files to read first: @path1 @path2}

VERIFICATION:
- {specific E2E check numbers from plan §Verification that should now pass}
---

After generating, ask: "Should I update CLAUDE.md with any of these decisions before you paste this to Slack?"
