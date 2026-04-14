# Deadeye Duncan — Pazaak Bot

Deadeye Duncan hosts the server's pazaak table. He is the KOTOR character best remembered for
being the first player you meet after leaving Taris — a hopeful underdog with a losing record who
somehow keeps showing up. His voice is self-deprecating bravado: he complains, copes, and talks
himself up despite overwhelming evidence to the contrary.

The bot is designed to keep games fast and visible in-channel while keeping private hand
information off the public board.

## Persona

Deadeye Duncan celebrates your wins by mourning his own role in them. He does not slow the game
down with excessive dialogue. His comments target himself more than the players and are short enough
to scan in one glance.

Key voice notes:
- Self-pitying but never boring.
- Sarcastic about the table's rules, not about the players.
- Credits transactions are framed as reluctant handovers, not administrative notices.
- Does not repeat the same line twice in a row if avoidable.

## Game Rules

Pazaak is from KOTOR. These are the canonical KOTOR-flavored house rules in use on this server.

### Match Structure

- First player to **win 3 sets** wins the match and collects the wager.
- A **tie** (both players stand on the same total in the same set) plays another set without
  refreshing side-deck hands.

### Sets

Within each set:
- Players aim to get their board total as close to **20** as possible without going over.
- Going over 20 is a **bust** — that player loses the set immediately.
- Reaching exactly **9 cards** triggers an **auto-stand**.

### Decks

| Deck | Contents |
|---|---|
| Main deck | Four copies of cards 1 through 10 (40 cards total) |
| Side deck | Each player draws 4 random side cards at the start of the match |

Side cards range from −6 through +6 in fixed or flexible (±) variants:

| Type | Behavior |
|---|---|
| Fixed positive (`+4`, `+5`, `+6`) | Always adds the stated value |
| Fixed negative (`−4`, `−5`, `−6`) | Always subtracts the stated value |
| Flex (`+/−1`, `+/−2`, `+/−3`, `+/−6`) | Player chooses + or − at play time |

### Turn Flow

1. Player draws a card from the main deck (or stands to end.
2. After a draw, the player may optionally play one side card from their hand.
3. Side cards can be played only once per match.
4. When done, the player banks the total and the turn passes to the opponent.
5. If the final total exceeds 20, the player busts and loses the set.

### Nine-Card Auto-Stand

If a player's board reaches 9 cards, they automatically stand on whatever total they hold. This
prevents infinite draw loops.

## Commands

### `/pazaak challenge`

Issue a pazaak challenge to another server member.

**Options:**
| Option | Required | Description |
|---|---|---|
| `opponent` | yes | The user to challenge |
| `wager` | yes | Credits to put on the table (1–5000) |

Posts a public challenge embed with **Accept** and **Decline** buttons. Both players must have
enough credits to cover the wager or the challenge is rejected.

---

### `/pazaak rules`

Displays the current pazaak ruleset embed.

---

### `/pazaak wallet`

Shows your current credit balance, win/loss record, active streak, best streak, and top rivalry.
Includes a note about when your daily bonus next becomes available.

---

### `/pazaak daily`

Claims your daily bonus credits. Default bonus is **200 credits** every 24 hours. If the cooldown
has not elapsed, the bot tells you how many hours remain.

Configurable via `DEADEYE_DAILY_BONUS` (credit amount) and `DEADEYE_DAILY_COOLDOWN_MS`
(cooldown in milliseconds, default 86400000 = 24 hours).

---

### `/pazaak leaderboard`

Shows the top 10 players sorted by credit balance.

## Match Flow (Discord UX)

```
Player A: /pazaak challenge opponent:@Player-B wager:500
```

→ Public embed with Accept / Decline buttons.

```
Player B clicks Accept.
```

→ Public board embed updates with the match state (totals, sets won, side cards remaining).
→ Each player receives a **private ephemeral control panel** with their hand, board state, and
  action buttons.

During the match, players use their private panel to:
- **Draw** — draw the next card from the main deck.
- **Stand** — end your turn without drawing.
- **Play side card** — after a draw, play one of your remaining side cards.
- **End Turn** — bank the current total without playing a side card.

The **Forfeit** button appears on the public board. Either player can forfeit to immediately award
the win to their opponent.

When the match ends, credits are transferred and a **Rematch** button replaces the action buttons
on the public board. Either participant can click Rematch to issue a fresh challenge at the same
wager.

## Credit Economy

| Event | Credit change |
|---|---|
| Match win | +wager amount |
| Match loss | −wager amount (floor: 0, never negative) |
| Daily bonus | +200 (default, configurable) |
| Starting balance | 1000 (default, configurable) |

This is a **closed fake-credit economy** — credits are server-internal and have no real-money
value. There is no cashout, no external marketplace, and no convertible rate.

## Privacy Model

- The public board shows both players' totals, sets won, side cards remaining, and standing status.
- **Individual hand card values are never shown on the public board.**
- Players see their own hand only through their ephemeral private control panel (`Open Controls`
  button or re-triggered by any private action).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DEADEYE_DATA_DIR` | `data/deadeye-duncan` | Directory for wallet JSON storage |
| `DEADEYE_STARTING_CREDITS` | `1000` | Credit balance for first-time players |
| `DEADEYE_DAILY_BONUS` | `200` | Credits awarded per daily claim |
| `DEADEYE_DAILY_COOLDOWN_MS` | `86400000` | Daily cooldown in milliseconds |

## Current Limitations

- Active match state is held in **memory only**. A process restart clears all games in progress
  without settlement. Disk-backed match snapshotting is the next persistence phase.
- The `Rematch` button uses player IDs embedded in the custom ID string. The names shown in the
  rematch challenge embed are pulled from the wallet file, so they reflect the last recorded
  display name.
- There is no turn timer yet. Inactive players can stall a match indefinitely.

## Next Phase

- Persist active match state to disk so restarts do not clear live games.
- Add a turn timer (configurable via environment variable) that auto-forfeits inactive players.
- Add a `rivalry` subcommand to inspect head-to-head records against a specific opponent.
- Add streak bonuses (e.g. +50 credits per win on a 5+ streak).
- Add a `spectate` subcommand that shows the current board as an updated embed in a separate
  message.
