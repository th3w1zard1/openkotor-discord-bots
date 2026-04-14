# Trask — KOTOR Source Lookup

Trask is the server's Q&A bot for finding KOTOR-related resources. Ask it a question about modding, tools, troubleshooting, or any KOTOR topic, and it searches a curated list of trusted sources to find relevant results.

---

## Quick Start

Type **`/ask`** followed by your question. Trask searches the approved source list and returns up to 5 matching results with links.

**Example:**
```
/ask query:how to convert models with mdlops
```

---

## Commands

### `/ask`

Search for KOTOR-related resources.

| What to fill in | What it means |
|---|---|
| **query** | Your question or topic (up to 200 characters) |

Trask looks through the names, descriptions, and tags of all approved sources and returns the best matches. Each result shows the source name, a short description, and a link.

The response is visible to everyone in the channel.

**Example searches:**
- `/ask query:dialog editor` — Find tools for editing dialog files
- `/ask query:kotor crash fix widescreen` — Find PC compatibility and troubleshooting resources
- `/ask query:nwscript compiling` — Find scripting references
- `/ask query:texture modding` — Find modding resources

### `/sources`

List all approved sources that Trask can search.

| What to fill in | What it means |
|---|---|
| **kind** (optional) | Filter by type: `website`, `github`, or `discord` |

Shows up to 10 sources with their name, description, and type. Only you can see the response.

**Examples:**
- `/sources` — see everything
- `/sources kind:github` — see only GitHub repositories
- `/sources kind:website` — see only websites

---

## What Sources Does Trask Search?

Trask searches a curated list of trusted KOTOR community resources:

### Websites

| Source | What it covers |
|---|---|
| **Deadly Stream** | The main KOTOR modding hub — mods, forums, guides, TSLRCM |
| **LucasForums Archive** | Archived forum discussions from the original KOTOR modding community |
| **PCGamingWiki** | PC compatibility fixes, widescreen patches, troubleshooting |
| **KOTOR Neocities** | Community technical documentation, file format notes, guides |
| **PyKotor Wiki** | PyKotor scripting reference and automation documentation |

### GitHub Repositories

| Source | What it covers |
|---|---|
| **reone** | Open-source KOTOR engine reimplementation |
| **Northern Lights** | Engine, rendering, and tooling work |
| **MDLOps** | Model conversion and asset pipeline tools |
| **PyKotor** | Python library for reading/writing KOTOR file formats |
| **kotor.js** | JavaScript KOTOR tools for browser and web |

### Discord

| Source | What it covers |
|---|---|
| **Approved Discord** | Indexed messages from opt-in server channels (when enabled) |

---

## FAQ

**Trask gave me a "not available here" error. What happened?**
Trask may be restricted to certain channels on this server. Try using the command in a different channel, or ask a server admin which channels Trask works in.

**The results are not very detailed. Why?**
Trask currently does keyword matching against the source catalog — it matches your words against source names, descriptions, and tags. It does not yet search the full text of those websites. A more detailed search system is being built.

**Can I suggest a new source?**
Yes — ask a server admin. Sources are added to the approved list by the people running the server.
