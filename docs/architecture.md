# Architecture Snapshot

## Foundation Choices

- Runtime: Node.js 24+
- Language: TypeScript (strict, `exactOptionalPropertyTypes`)
- Discord SDK: `discord.js` 14.26.x
- Workspace tool: `pnpm` via Corepack
- Build tool: `tsc -b` project references
- Persistence bootstrap: JSON file storage (`packages/persistence`)
- Planned long-term persistence: Postgres + pgvector

## Apps

### Trask (`apps/trask-bot`)

Purpose: guild-first troubleshooting and source lookup.

Commands: `/ask`, `/sources`, `/queue-reindex`.

Current implementation: slash commands backed by a `ChunkSearchProvider` that merges
on-disk text chunks (from the ingest worker) with a static keyword-scored source catalog.
`/ask` generates a citation-aware answer via OpenAI chat when `OPENAI_API_KEY` is set;
falls back to keyword catalog summary when no key is configured.

Config prefix: `TRASK_*`. Reads `TRASK_ALLOWED_GUILD_IDS` and `TRASK_APPROVED_CHANNEL_IDS` for
scope restrictions. Shares `INGEST_STATE_DIR` with the ingest worker for chunk storage.

Next phase: approved Discord channel indexing, Firecrawl-backed web scrape, chunk embeddings via
OpenAI, and pgvector semantic retrieval.

---

### HK (`apps/hk-bot`)

Purpose: curated self-role assignment.

Commands: `/designations panel`, `/designations list`, `/designations assign`,
`/designations remove`.

Components: string select menu (`hk:designation-sync`) for batch sync.

Current implementation: reads live guild roles on each request, applies diffs using Discord role
hierarchy checks, and surfaces missing or blocked roles explicitly. All changes include audit-log
reasons.

Config prefix: `HK_*`.

Next phase: persisted designation presets, onboarding message with panel link, optional
admin-only role catalog management commands.

---

### Deadeye Duncan (`apps/deadeye-duncan-bot`)

Purpose: KOTOR-faithful pazaak with a fake-credit economy.

Commands: `/pazaak rules`, `/pazaak wallet`, `/pazaak daily`, `/pazaak leaderboard`,
`/pazaak challenge`, `/pazaak rivalry`.

Components: Accept/Decline challenge buttons, public board with Open Controls/Forfeit/Rematch
buttons, private ephemeral action panels with Draw/Stand/EndTurn/Play side card buttons.

Current implementation: `PazaakCoordinator` with file-backed match snapshots (`MatchStore`)
plus disk-backed wallet repository (`JsonWalletRepository`). Match state survives process
restarts. A 60-second interval auto-forfeits the active player when `DEADEYE_TURN_TIMEOUT_MS`
(default 5 min) elapses without action. Wallet state (balance, wins, losses, streak,
rivalries, last daily) is persisted to JSON in `DEADEYE_DATA_DIR`.

Config prefix: `DEADEYE_*`. Configurable starting credits, daily bonus amount, daily cooldown,
and turn timeout.

Next phase: streak bonuses on daily claim, admin credit adjustment command.

---

### Ingest Worker (`apps/ingest-worker`)

Purpose: shared indexing and source refresh orchestration.

CLI commands: `list-sources`, `queue-reindex [sourceIds...]`, `show-indexed`, `show-config`.

Current implementation: `queue-reindex` fetches each source's `homeUrl` via `node:fetch`,
strips HTML, chunks text into ~500-word pieces, persists each chunk via `FileChunkStore`,
and writes a `_index.json` manifest per source recording chunk count and fetch timestamp.
`show-indexed` reads all manifests and prints a table of what has been indexed.
A 1-second delay is applied between sources to avoid hammering external servers.

Config: reads `INGEST_STATE_DIR` and shared AI config.

Next phase: Firecrawl-backed scrape for JavaScript-rendered pages, GitHub README/wiki sync,
Discord channel backfill, OpenAI embeddings, and chunk storage in pgvector.

---

## Shared Packages

| Package | Purpose |
|---|---|
| `@openkotor/config` | Typed environment loading for all apps |
| `@openkotor/core` | Discord client factory, logger, `deployGuildCommands`, `deployGlobalCommands` |
| `@openkotor/discord-ui` | Embed builders (`buildInfoEmbed`, `buildSuccessEmbed`, etc.) |
| `@openkotor/personas` | Persona copy, curated HK role catalog |
| `@openkotor/persistence` | `JsonWalletRepository` with wallet, rivals, daily bonus, and balance adjustment |
| `@openkotor/retrieval` | Source registry, `FileChunkStore` with source index manifests, `ChunkSearchProvider` |

## Data Flow: Deadeye Duncan Match

```
/pazaak challenge  ->  PazaakCoordinator.createChallenge()
Accept button      ->  PazaakCoordinator.acceptChallenge()
Draw/Stand/Play    ->  PazaakCoordinator.*()  (private ephemeral panel)
Match completes    ->  settleCompletedMatch() -> JsonWalletRepository.recordMatch()
Rematch button     ->  coordinator.createChallenge() -> new challenge embed
```

## Known Gaps

- Postgres and pgvector are not wired. All non-wallet persistence is file-based JSON.
