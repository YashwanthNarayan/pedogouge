# /standup — Generate EOD standup entry

Generate today's standup entry from git log + task list, then append to today's standup file.

```bash
export PNPM_HOME="/Users/yashwanth/Library/pnpm"; export PATH="$PNPM_HOME:$PATH"
git log --since=today.00:00 --author="$(git config user.email)" --oneline
git status
git diff --stat main...HEAD
```

Also read the current TaskList to see what was completed vs in_progress today.

Then produce an entry in this exact format:

```
## {Name} ({Role})
- Shipped: {comma-separated list from completed tasks + commits}
- In progress: {what's currently in_progress}
- Blocked: {open questions or upstream dependencies — "none" if none}
- Handoff: {anything ready for a teammate — "none" if none}
- Tomorrow: {1-sentence preview of what comes next}
```

Append to docs/STANDUPS/{today-YYYY-MM-DD}.md (create with `# Standup {date}` header if new).

Then commit:
```bash
git add docs/STANDUPS/
git commit -m "chore: standup $(date +%Y-%m-%d)"
git push
```

Do not edit any other files. Do not add emojis.
