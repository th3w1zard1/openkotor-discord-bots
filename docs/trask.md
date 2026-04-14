# Trask Bot

Trask Ulgo is the guild's troubleshooting and source-lookup bot. His personality is modelled on his
in-game role as the plain-spoken Republic soldier who walks you through the Endar Spire in the first
fifteen minutes of KOTOR: direct, urgency-aware, never condescending, and naturally instructional.

## Persona

Trask answers like a competent officer briefing a junior crew member. He states the most important
thing first, provides relevant citations, and flags when information is uncertain. He does not pad
answers with filler text, does not pretend to know things he cannot cite, and avoids genericisms
("interesting question", "great point").

Key voice notes:
- Concise and action-oriented.
- Caveats uncertain information explicitly ("I do not have a cached result for this yet").
- Prefers two sentences over a paragraph when the answer fits.
- References source names naturally ("Per the Deadly Stream index, …").

## Commands

### `/ask`

Search the approved source registry for KOTOR-related content.

**Options:**
| Option | Required | Description |
|---|---|---|
| `query` | yes | Question or topic (max 200 characters) |

**Behavior:**
- Searches the local source catalog using keyword scoring against source names, descriptions, and
  tags.
- Returns up to five matching sources with description snippets and home URLs.
- Current implementation is lexical/keyword only. Semantic search against indexed page chunks is
  the next phase once the ingest pipeline is wired.

**Example:**
```
/ask query:mdlops model formats
```

Returns matching sources from the source catalog such as MDLOps, KOTOR Neocities, and PyKotor.

---

### `/sources`

List the currently approved source catalog.

**Options:**
| Option | Required | Description |
|---|---|---|
| `kind` | no | Filter by type: `website`, `github`, or `discord` |

**Behavior:**
Returns up to ten sources per call. Shows source name, description, and freshness policy.

---

### `/queue-reindex`

Queue a source refresh request. Requires **Manage Guild** permission.

**Options:**
| Option | Required | Description |
|---|---|---|
| `source` | no | Source ID to refresh, or leave blank for all sources |

**Behavior:**
- Currently operates in stub mode — logs the request and records the queued source IDs.
- In the next phase this will dispatch a real crawl/embed job to the ingest worker.

---

## Approved Source Catalog

Trask's search is scoped to these sources by default:

| ID | Name | Kind | Notes |
|---|---|---|---|
| `deadlystream` | Deadly Stream | website | Primary KOTOR modding hub |
| `lucasforums-archive` | LucasForums Archive | website | Historical forum archive |
| `pcgamingwiki-kotor` | PCGamingWiki | website | PC compatibility and fixes |
| `kotor-neocities` | KOTOR Neocities | website | Community technical docs |
| `pykotor-wiki` | PyKotor Wiki | website | PyKotor scripting reference |
| `reone-repo` | reone | github | Open engine reimplementation |
| `northernlights-repo` | Northern Lights | github | Engine and tooling work |
| `mdlops-repo` | MDLOps | github | Model conversion tooling |
| `pykotor-repo` | PyKotor | github | Python KOTOR library |
| `kotorjs-repo` | kotor.js | github | JS KOTOR tooling |
| `approved-discord-knowledge` | Approved Discord | discord | Opt-in guild channel index |

## Admin Setup

The following environment variables control Trask's scope:

| Variable | Purpose |
|---|---|
| `TRASK_ALLOWED_GUILD_IDS` | Comma-separated guild IDs where Trask is active |
| `TRASK_APPROVED_CHANNEL_IDS` | Comma-separated channel IDs approved for Discord message indexing |

Channels are only indexed when explicitly listed in `TRASK_APPROVED_CHANNEL_IDS`. Trask never
performs blanket server-history reads.

## Current Limitations

- Answers are source-catalog matches, not LLM-generated summaries. There is no RAG pipeline yet.
- The ingest worker does not perform real web scraping yet. `/queue-reindex` records a stub
  request.
- Discord message indexing requires `MESSAGE_CONTENT` privileged intent enabled in the Developer
  Portal and the channel ID whitelisted in `TRASK_APPROVED_CHANNEL_IDS`.

## Next Phase

- Wire Firecrawl or a custom fetcher to scrape approved web sources on a schedule.
- Chunk, embed, and store indexed content in Postgres via pgvector.
- Replace the static catalog search with a vector-plus-lexical hybrid retrieval pass.
- Add citation-aware summarization using the configured `OPENAI_CHAT_MODEL`.
- Add a `/summarize` command for quick document summaries with source attribution.
