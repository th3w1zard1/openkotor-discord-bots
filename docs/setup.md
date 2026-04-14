# Setup Guide

This guide walks through getting the three bots running locally against a test Discord guild.

## Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| Node.js | 24.0.0 | Required by all apps |
| pnpm | 10.x | Managed via Corepack — run `corepack enable` once |
| Discord accounts | — | One application per bot (Trask, HK, Deadeye Duncan) |

## 1. Create Three Discord Applications

Go to [discord.com/developers/applications](https://discord.com/developers/applications) and create
three separate applications — one for each bot. For each application:

1. Copy the **Application ID** and **Public Key** from the General Information tab.
2. Open the **Bot** section, reset the token, and copy it.
3. Enable **Server Members Intent** for the HK bot and Trask bot. Enable **Message Content Intent**
   for Trask if you plan to use approved-channel indexing.
4. Under **OAuth2 → URL Generator**, select the `bot` and `applications.commands` scopes, add the
   permissions your bot needs (see below), and paste the generated URL into your test guild.

### Minimum Permissions

| Bot | Permission bits |
|---|---|
| Trask | Read Messages, Send Messages, Embed Links, Read Message History |
| HK | Manage Roles, Read Messages, Send Messages, Embed Links |
| Deadeye Duncan | Read Messages, Send Messages, Embed Links |

> **Role hierarchy:** For HK to assign roles, its highest role must sit above every role it is
> expected to manage in the guild's role list.

## 2. Clone and Install

```bash
git clone https://github.com/your-org/openkotor-discord-bots
cd openkotor-discord-bots
corepack enable
corepack pnpm install
```

## 3. Configure Environment

Copy `.env.example` to `.env` and fill in the values for the bots you want to run:

```bash
cp .env.example .env
```

Key variables to fill in immediately:

```
DISCORD_TARGET_GUILD_ID=      # optional shared test guild id for all three bots

TRASK_DISCORD_APP_ID=
TRASK_DISCORD_PUBLIC_KEY=
TRASK_DISCORD_BOT_TOKEN=
TRASK_DISCORD_GUILD_ID=      # optional override; otherwise DISCORD_TARGET_GUILD_ID is used

HK_DISCORD_APP_ID=
HK_DISCORD_PUBLIC_KEY=
HK_DISCORD_BOT_TOKEN=
HK_DISCORD_GUILD_ID=         # optional override; otherwise DISCORD_TARGET_GUILD_ID is used

DEADEYE_DISCORD_APP_ID=
DEADEYE_DISCORD_PUBLIC_KEY=
DEADEYE_DISCORD_BOT_TOKEN=
DEADEYE_DISCORD_GUILD_ID=    # optional override; otherwise DISCORD_TARGET_GUILD_ID is used
```

Shared AI / retrieval variables are optional until you wire the live-scrape phase:

```
OPENAI_API_KEY=            # optional until Trask ingests real content
FIRECRAWL_API_KEY=         # optional — used by future ingest pipeline
DATABASE_URL=              # optional — defaults to local file storage
```

## 4. Build

```bash
corepack pnpm build
```

A clean exit with no output means all three apps compiled successfully.

## 5. Run a Bot

Each app is a plain Node.js script. Use the workspace dev scripts to run one at a time:

```bash
# Trask
corepack pnpm dev:trask

# HK
corepack pnpm dev:hk

# Deadeye Duncan
corepack pnpm dev:deadeye
```

On the first startup, the bot auto-deploys guild-scoped slash commands to the guild configured in
`*_DISCORD_GUILD_ID`, or `DISCORD_TARGET_GUILD_ID` when the per-bot override is omitted. Guild commands appear in Discord within seconds.

To generate the three OAuth install links once the application IDs exist:

```bash
corepack pnpm discord:install-links
```

## 6. Verify Each Bot

### Trask
- `/ask query:mdlops` → should return a list of matching sources from the catalog.
- `/sources` → should list all approved source entries.
- `/queue-reindex` → should confirm stub mode and queue count.

### HK
- `/designations list` → should display the curated role catalog by category.
- `/designations panel` → should open a multi-select sync panel.
- `/designations assign designation:reone` → should add the matching guild role (the role must exist
  in the guild with the exact same name as in the catalog).

### Deadeye Duncan
- `/pazaak rules` → displays the pazaak rule embed.
- `/pazaak wallet` → shows your starting credit balance.
- `/pazaak daily` → awards the daily bonus on first claim.
- `/pazaak challenge opponent:@someone wager:100` → issues a challenge embed with Accept/Decline.

## 7. Data Directories

Deadeye Duncan writes wallet state to disk at the path in `DEADEYE_DATA_DIR` (default:
`data/deadeye-duncan/`). The directory is created automatically on first run. These files are
local-only and not committed to the repository.

## 8. Running the Ingest Worker CLI

The ingest worker is a standalone CLI stub, not a long-running service yet:

```bash
# List all registered sources
node --import tsx/esm apps/ingest-worker/src/main.ts list-sources

# Queue a refresh for one source
node --import tsx/esm apps/ingest-worker/src/main.ts queue-reindex deadlystream

# Show loaded config
node --import tsx/esm apps/ingest-worker/src/main.ts show-config
```

## Common Problems

| Symptom | Likely cause |
|---|---|
| `Missing required environment variable` | `.env` is not present or a required `*_DISCORD_BOT_TOKEN` is blank |
| Commands not appearing in Discord | `*_DISCORD_GUILD_ID` is wrong or the bot lacks `applications.commands` OAuth scope in the guild |
| HK cannot assign roles | HK's role is not above the target roles in the guild hierarchy |
| `Object is possibly undefined` at runtime | Restart the TypeScript build; this should not surface in compiled output |
| Empty wallet file on startup | Expected — the file is created on first interaction |
