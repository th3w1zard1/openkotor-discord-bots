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
- A **tie** (both players stand on the same total in the same set) plays another set with
  fresh side-deck hands — unless exactly one player has played a Tiebreaker card, in which
  case that player wins the set.
- The loser of a set goes first in the next set. On a tie, the original coin-flip opener resumes.
  First set opener is random.

### Sets

Within each set:
- Players aim to get their board total as close to **20** as possible without going over.
- Going over 20 on a draw is an immediate **bust** — that player loses the set with no chance to
  play a side card. Going over 20 from a side card play is also an immediate bust.
- Filling all **9 board slots** without busting wins the set automatically.

### Decks

| Deck | Contents |
|---|---|
| Main deck | Four copies of cards 1 through 10 (40 cards total) |
| Sideboard | Each player receives a random 10-card sideboard at match start |
| Hand | 4 cards drawn from the sideboard each set (always refreshed, including on ties) |

Side cards include:

| Type | Variants | Behavior |
|---|---|---|
| Plus (`+1`…`+6`) | Fixed positive | Always adds the stated value |
| Minus (`-1`…`-6`) | Fixed negative | Always subtracts the stated value |
| Flip (`±1`…`±6`) | Toggleable | Player chooses + or − at play time |
| Tiebreaker (`T+1`) | Special | Always adds +1; wins tied sets |
| Double (`x2`) | Special | Doubles the value of the last basic board card (main/plus/minus/flip only) |
| Flip 2&4 | Special | Flips the sign of all main-deck, plus, and minus 2s and 4s on the board |
| Flip 3&6 | Special | Flips the sign of all main-deck, plus, and minus 3s and 6s on the board |

### Turn Flow

1. Player draws a card from the main deck (mandatory — must draw before standing).
2. If the draw puts the total over 20, the player busts immediately (no recovery).
3. Otherwise, the player may optionally play one side card, then stand or end the turn.
4. Playing a side card does not end the turn — the player still chooses to stand or end turn afterward.
5. Side cards can be played only once per set; one card maximum per turn.
6. If a side card puts the total over 20, the player busts immediately.

### Nine-Card Auto-Win

If a player fills all 9 board slots without busting, they win the set automatically.

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
| `DEADEYE_DATA_DIR` | `data/deadeye-duncan` | Directory for wallet and match JSON storage |
| `DEADEYE_STARTING_CREDITS` | `1000` | Credit balance for first-time players |
| `DEADEYE_DAILY_BONUS` | `200` | Credits awarded per daily claim |
| `DEADEYE_DAILY_COOLDOWN_MS` | `86400000` | Daily cooldown in milliseconds |
| `DEADEYE_TURN_TIMEOUT_MS` | `300000` | Turn timeout before auto-forfeit (5 minutes) |

## Current Limitations

- The `Rematch` button uses player IDs embedded in the custom ID string. The names shown in the
  rematch challenge embed are pulled from the wallet file, so they reflect the last recorded
  display name.
- There is no deck-building UI. Players receive a random 10-card sideboard per match.

## Next Phase

- Add a `spectate` subcommand that shows the current board as an updated embed in a separate
  message.
- Add deck-building interaction (modal or multi-step) to let players pick their 10-card sideboard.
