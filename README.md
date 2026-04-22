# Pedagogue

A closed-loop AI pedagogical system for high-school CS students. Students submit an assignment idea, and Pedagogue generates a full learning plan, integrates deeply into their VS Code editor, tracks mastery from every keystroke, and ends with a voice-based defense interview that produces a cryptographically-verifiable credential proving they actually understood what they built.

## Architecture

Three surfaces, one closed loop:

| Surface | Stack | Purpose |
|---------|-------|---------|
| VS Code Extension | TypeScript + esbuild | Primary student surface: `@tutor` chat, tree-sitter diagnostics, pseudoterminal, DAP pair debug |
| Web Dashboard | Next.js 15 + Vercel | Session overview, teacher dashboard, voice defense UI, credential page |
| Mobile Companion | Expo (React Native) | Read-only: credentials + SM-2 reminders |
| Terminal CLI | Node + Ink | `pedagogue new/run/defend` for terminal-native students |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full 10-layer closed loop and [.claude/plans/lazy-drifting-salamander.md](.claude/plans/lazy-drifting-salamander.md) for the complete design.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+ (`curl -fsSL https://get.pnpm.io/install.sh | sh -`)
- VS Code 1.95+ (for extension development)

### Setup

```bash
git clone <repo-url>
cd pedagogue

# Install all dependencies (pnpm workspaces)
pnpm install

# Copy env template
cp .env.example .env.local
# Fill in your API keys (see .env.example for descriptions)

# Run everything in dev mode
pnpm dev

# Run tests
pnpm test

# Build all packages
pnpm -r build
```

### Extension Development

```bash
# Build the VS Code extension
pnpm --filter pedagogue-extension build

# In VS Code: press F5 to launch Extension Development Host
# Type @tutor hello in the Chat panel to verify
```

### Database Setup

```bash
# Install Supabase CLI
pnpm add -g supabase

# Link to your Supabase project
supabase link --project-ref <your-project-ref>

# Apply migrations
supabase db push

# Seed demo data
pnpm seed:demo
```

## Project Structure

```
pedagogue/
├── packages/
│   ├── extension/      # VS Code extension (CommonJS, esbuild)
│   ├── shared/         # Zod schemas + API types + channels (ESM)
│   └── cli/            # Terminal CLI (ESM, Ink)
├── apps/
│   ├── web/            # Next.js 15 web app
│   └── mobile/         # Expo mobile app
├── lib/                # Shared server-side libraries
│   ├── anthropic/      # Claude client + intake + curriculum + defense
│   ├── voice/          # Deepgram + ElevenLabs + turn manager
│   ├── supabase/       # DB client + pgvector + realtime
│   ├── credential/     # Ed25519 signing + W3C VC builder
│   ├── judge0/         # Code execution client
│   └── ...
├── infra/
│   ├── supabase/       # Migrations + seed + edge functions
│   ├── judge0/         # Docker Compose for self-hosted Judge0
│   ├── y-websocket/    # Fly.io Yjs server
│   └── defense-ws/     # Fly.io voice defense orchestrator
└── docs/
    ├── ARCHITECTURE.md
    ├── CONTRACTS.md
    └── DECISIONS/      # Architecture Decision Records
```

## Key Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all workspace dependencies |
| `pnpm dev` | Start all packages in watch mode |
| `pnpm test` | Run unit tests across monorepo |
| `pnpm test:rls` | Run Supabase RLS policy tests |
| `pnpm gen:schemas` | Regenerate JSON schemas from Zod |
| `pnpm seed:demo` | Seed demo session in Supabase |
| `pnpm --filter pedagogue-extension build` | Build VS Code extension |

## Integration Contracts

All integration surfaces are frozen after Day 1. Changes require 2 approvals:

- **Zod Schemas**: `packages/shared/src/schemas/` — the source of truth for all data shapes
- **API Types**: `packages/shared/src/api.ts`
- **Realtime Channels**: `packages/shared/src/channels.ts`
- **Env Vars**: `.env.example`
- **DB Schema**: `infra/supabase/migrations/`

See [docs/CONTRACTS.md](docs/CONTRACTS.md) for details.

## Security

Ed25519-signed W3C Verifiable Credentials. Public key at `/.well-known/jwks.json`. Full security architecture in [.claude/plans/lazy-drifting-salamander.md](.claude/plans/lazy-drifting-salamander.md) sections P.1–P.18.

## Team

Built at a 5-day hackathon. 3 people + Claude Code.

- **P1**: VS Code Extension + Mobile
- **P2**: AI + Voice + Web UI
- **P3**: Backend Infra + Teacher Dashboard + Credential
