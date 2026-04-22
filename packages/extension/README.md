# Pedagogue — VS Code Extension

AI-powered pedagogical tutor for high-school CS students.

Built for the Pedagogue 5-day hackathon. See `.claude/plans/lazy-drifting-salamander.md` for the full system design.

## Development

```bash
pnpm --filter pedagogue-extension build   # compile to dist/
# F5 in VS Code to launch Extension Development Host
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Cmd+Alt+T | Trigger inline hint |
| Cmd+Alt+D | Start defense interview |
| Cmd+Alt+G | Open skill graph panel |

## Privacy

Code, errors, and chat messages are sent to the Pedagogue backend (Anthropic API with zero-retention mode). See [Privacy Policy](https://pedagogue.app/privacy).
