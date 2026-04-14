# OpenKOTOR Discord Bots

This repository contains the first implementation pass for a KOTOR-themed Discord bot suite:

- `Trask`: a troubleshooting and source-search assistant.
- `HK`: a curated self-role bot with HK-style responses.
- `Deadeye Duncan`: a pazaak and fake-credit social game bot.
- `ingest-worker`: the shared ingestion and indexing entry point.

## Current State

This is the foundation phase. The monorepo includes:

- shared configuration, logging, UI, persona, retrieval, and persistence packages
- three runnable Discord bot apps with initial command sets
- a first Deadeye pazaak vertical slice with in-memory active matches and file-backed wallets
- a Trask source catalog and local search stub over approved source metadata

## Workspace Layout

```text
apps/
  trask-bot/
  hk-bot/
  deadeye-duncan-bot/
  ingest-worker/
packages/
  config/
  core/
  discord-ui/
  persistence/
  personas/
  retrieval/
docs/
infra/
```

## Getting Started

1. Copy `.env.example` to `.env` and fill the relevant Discord app credentials.
2. Install dependencies with `corepack pnpm install`.
3. Build the workspace with `corepack pnpm build`.
4. Run one bot at a time with one of:
   - `corepack pnpm dev:trask`
   - `corepack pnpm dev:hk`
   - `corepack pnpm dev:deadeye`
   - `corepack pnpm dev:ingest`

All bots auto-register guild-scoped commands when their corresponding `*_DISCORD_GUILD_ID` is present.
You can also set `DISCORD_TARGET_GUILD_ID` once and let all three bots target the same guild by default.

## Notes

- The retrieval stack is intentionally local-first in this pass. Trask searches a seeded source catalog now; live scraping and semantic indexing are the next phase.
- Deadeye Duncan wallets are persisted to a JSON file so the game loop is usable before the Postgres layer is wired in.
- HK only manages a curated allowlist of opt-in roles and refuses to touch roles above the bot in the guild hierarchy.