import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Card type system — matches HoloPazaak (PyQt6) canonical types.
// ---------------------------------------------------------------------------

export type SideCardType =
  | "plus"             // Fixed positive (+1 to +6)
  | "minus"            // Fixed negative (−1 to −6)
  | "flip"             // Toggleable ± (±1 to ±6)
  | "double"           // Doubles value of last board card
  | "tiebreaker"       // Always +1, wins ties
  | "flip_two_four"    // Flips the sign of all 2s and 4s on the board
  | "flip_three_six"   // Flips the sign of all 3s and 6s on the board
  | "plus_minus_3_6";  // Asymmetric +3/−6 (KOTOR 1)

export interface SideCard {
  id: string;
  label: string;
  /** Unsigned magnitude for plus/minus/flip/tiebreaker; 0 for effect-only cards. */
  value: number;
  type: SideCardType;
}

export interface SideCardOption {
  cardId: string;
  displayLabel: string;
  appliedValue: number;
}

export interface AppliedSideCard {
  cardId: string;
  label: string;
  appliedValue: number;
}

/** A single card sitting on a player's board (main-deck draw or played side card). */
export interface BoardCard {
  value: number;
  frozen: boolean;
  /** Origin card type — undefined for main-deck draws. Used for double-card targeting. */
  source?: SideCardType;
}

export const SIDE_DECK_SIZE = 10;
export const HAND_SIZE = 4;
export const MAX_BOARD_SIZE = 9;
export const WIN_SCORE = 20;
export const SETS_TO_WIN = 3;

export interface MatchPlayerState {
  userId: string;
  displayName: string;
  roundWins: number;
  /** 10-card sideboard drawn once per match. */
  sideDeck: SideCard[];
  /** 4-card hand drawn from sideDeck each set. */
  hand: SideCard[];
  usedCardIds: Set<string>;
  board: BoardCard[];
  sideCardsPlayed: AppliedSideCard[];
  total: number;
  stood: boolean;
  /** True if a Tiebreaker card has been played this set. */
  hasTiebreaker: boolean;
}

export interface PendingChallenge {
  id: string;
  channelId: string;
  challengerId: string;
  challengerName: string;
  challengedId: string;
  challengedName: string;
  wager: number;
  createdAt: number;
  expiresAt: number;
}

export interface PazaakMatch {
  id: string;
  channelId: string;
  publicMessageId: string | null;
  wager: number;
  players: [MatchPlayerState, MatchPlayerState];
  activePlayerIndex: number;
  setNumber: number;
  mainDeck: number[];
  phase: "turn" | "after-draw" | "after-card" | "completed";
  pendingDraw: number | null;
  statusLine: string;
  createdAt: number;
  updatedAt: number;
  /** Timestamp when the current active player's decision window opened. Reset on every action. */
  turnStartedAt: number;
  /** Index of the player who opens the first set (random). */
  initialStarterIndex: number;
  /** Index of the player who won the most recent set (null before any set resolves or on tie). */
  lastSetWinnerIndex: number | null;
  winnerId: string | null;
  winnerName: string | null;
  loserId: string | null;
  loserName: string | null;
  settled: boolean;
}

/**
 * Minimal persistence interface so the coordinator can fire-and-forget
 * match snapshots without importing the concrete store class (avoids
 * a circular dependency between pazaak.ts and match-store.ts).
 */
export interface MatchPersistence {
  save(match: PazaakMatch): Promise<void>;
  loadActive(maxAgeMs: number): Promise<PazaakMatch[]>;
}

// ---------------------------------------------------------------------------
// Card pool — full KOTOR / TSL canonical side-card catalogue.
// ---------------------------------------------------------------------------

const sideCardTemplates: readonly SideCard[] = [
  // Plus cards (+1 through +6)
  { id: "plus1", label: "+1", value: 1, type: "plus" },
  { id: "plus2", label: "+2", value: 2, type: "plus" },
  { id: "plus3", label: "+3", value: 3, type: "plus" },
  { id: "plus4", label: "+4", value: 4, type: "plus" },
  { id: "plus5", label: "+5", value: 5, type: "plus" },
  { id: "plus6", label: "+6", value: 6, type: "plus" },
  // Minus cards (−1 through −6)
  { id: "minus1", label: "-1", value: 1, type: "minus" },
  { id: "minus2", label: "-2", value: 2, type: "minus" },
  { id: "minus3", label: "-3", value: 3, type: "minus" },
  { id: "minus4", label: "-4", value: 4, type: "minus" },
  { id: "minus5", label: "-5", value: 5, type: "minus" },
  { id: "minus6", label: "-6", value: 6, type: "minus" },
  // Flip cards (±1 through ±6)
  { id: "flip1", label: "±1", value: 1, type: "flip" },
  { id: "flip2", label: "±2", value: 2, type: "flip" },
  { id: "flip3", label: "±3", value: 3, type: "flip" },
  { id: "flip4", label: "±4", value: 4, type: "flip" },
  { id: "flip5", label: "±5", value: 5, type: "flip" },
  { id: "flip6", label: "±6", value: 6, type: "flip" },
  // Special cards
  { id: "double", label: "x2", value: 0, type: "double" },
  { id: "tiebreaker", label: "T+1", value: 1, type: "tiebreaker" },
  { id: "flip24", label: "Flip 2&4", value: 0, type: "flip_two_four" },
  { id: "flip36", label: "Flip 3&6", value: 0, type: "flip_three_six" },
] as const;

const shuffle = <T>(items: readonly T[]): T[] => {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }

  return copy;
};

const cloneCard = (card: SideCard): SideCard => ({ ...card });

/** Build a 10-card sideboard for one player, drawn from the full card pool. */
const drawSideDeck = (): SideCard[] => {
  const deck: SideCard[] = [];

  for (let i = 0; i < SIDE_DECK_SIZE; i += 1) {
    const template = sideCardTemplates[Math.floor(Math.random() * sideCardTemplates.length)]!;
    deck.push({ ...template, id: `${template.id}_${i}` });
  }

  return deck;
};

/** Draw HAND_SIZE cards from the sideboard for one set. */
const drawHandFromSideDeck = (sideDeck: SideCard[]): SideCard[] => {
  return shuffle(sideDeck).slice(0, HAND_SIZE).map(cloneCard);
};

const buildMainDeck = (): number[] => {
  const deck: number[] = [];

  for (let value = 1; value <= 10; value += 1) {
    for (let copy = 0; copy < 4; copy += 1) {
      deck.push(value);
    }
  }

  return shuffle(deck);
};

const createPlayerState = (userId: string, displayName: string): MatchPlayerState => {
  const sideDeck = drawSideDeck();
  return {
    userId,
    displayName,
    roundWins: 0,
    sideDeck,
    hand: drawHandFromSideDeck(sideDeck),
    usedCardIds: new Set<string>(),
    board: [],
    sideCardsPlayed: [],
    total: 0,
    stood: false,
    hasTiebreaker: false,
  };
};

const formatSignedValue = (value: number): string => {
  return value > 0 ? `+${value}` : `${value}`;
};

const playerAt = (match: PazaakMatch, index: number): MatchPlayerState => {
  return match.players[index]!;
};

export const getCurrentPlayer = (match: PazaakMatch): MatchPlayerState => {
  return playerAt(match, match.activePlayerIndex);
};

export const getPlayerForUser = (match: PazaakMatch, userId: string): MatchPlayerState | undefined => {
  return match.players.find((player) => player.userId === userId);
};

export const getOpponentForUser = (match: PazaakMatch, userId: string): MatchPlayerState | undefined => {
  return match.players.find((player) => player.userId !== userId);
};

export const renderBoardLine = (player: MatchPlayerState): string => {
  if (player.board.length === 0) return "No cards in play";
  const parts = player.board.map((card, i) => {
    if (i === 0) return `${card.value}`;
    return card.value >= 0 ? `+ ${card.value}` : `− ${Math.abs(card.value)}`;
  });
  return `${parts.join(" ")} = **${player.total}**`;
};

export const renderHandLine = (player: MatchPlayerState): string => {
  return player.hand
    .map((card) => {
      const used = player.usedCardIds.has(card.id);
      return used ? `~~${card.label}~~` : card.label;
    })
    .join(" | ");
};

export const getSideCardOptionsForPlayer = (player: MatchPlayerState): SideCardOption[] => {
  const options: SideCardOption[] = [];

  for (const card of player.hand) {
    if (player.usedCardIds.has(card.id)) {
      continue;
    }

    switch (card.type) {
      case "plus":
        options.push({
          cardId: card.id,
          displayLabel: `Play +${card.value}`,
          appliedValue: card.value,
        });
        break;

      case "minus":
        options.push({
          cardId: card.id,
          displayLabel: `Play -${card.value}`,
          appliedValue: -card.value,
        });
        break;

      case "flip":
        options.push({
          cardId: card.id,
          displayLabel: `Play +${card.value}`,
          appliedValue: card.value,
        });
        options.push({
          cardId: card.id,
          displayLabel: `Play -${card.value}`,
          appliedValue: -card.value,
        });
        break;

      case "tiebreaker":
        options.push({
          cardId: card.id,
          displayLabel: "Play T+1",
          appliedValue: 1,
        });
        break;

      case "double": {
        // Match double-card targeting: last MAIN/PLUS/MINUS/FLIP card only.
        let targetCard: BoardCard | undefined;
        for (let i = player.board.length - 1; i >= 0; i--) {
          const src = player.board[i]!.source;
          if (src === undefined || src === "plus" || src === "minus" || src === "flip") {
            targetCard = player.board[i]!;
            break;
          }
        }
        if (targetCard) {
          options.push({
            cardId: card.id,
            displayLabel: `Play x2 (${targetCard.value}→${targetCard.value * 2})`,
            appliedValue: targetCard.value,
          });
        }
        break;
      }

      case "flip_two_four":
        options.push({
          cardId: card.id,
          displayLabel: "Play Flip 2&4",
          appliedValue: 0,
        });
        break;

      case "flip_three_six":
        options.push({
          cardId: card.id,
          displayLabel: "Play Flip 3&6",
          appliedValue: 0,
        });
        break;
    }
  }

  return options;
};

/** Reset board state for a new set.  A fresh hand is always drawn from the sideboard. */
const resetPlayerForSet = (player: MatchPlayerState): void => {
  player.board = [];
  player.sideCardsPlayed = [];
  player.total = 0;
  player.stood = false;
  player.hasTiebreaker = false;

  player.hand = drawHandFromSideDeck(player.sideDeck);
  player.usedCardIds = new Set<string>();
};

export class PazaakCoordinator {
  private readonly pendingChallenges = new Map<string, PendingChallenge>();

  private readonly matches = new Map<string, PazaakMatch>();

  private readonly activeMatchIdsByUserId = new Map<string, string>();

  public constructor(private readonly persistence?: MatchPersistence) {}

  /**
   * Restore active matches from persistent storage on startup.
   * Call once before the bot logs in.
   */
  public async initialize(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
    if (!this.persistence) return;

    const matches = await this.persistence.loadActive(maxAgeMs);

    for (const match of matches) {
      this.matches.set(match.id, match);

      for (const player of match.players) {
        this.activeMatchIdsByUserId.set(player.userId, match.id);
      }
    }
  }

  /** All matches that are not yet completed (safe for turn-timer scanning). */
  public getActiveMatches(): PazaakMatch[] {
    return [...this.matches.values()].filter((m) => m.phase !== "completed");
  }

  public createChallenge(input: {
    channelId: string;
    challengerId: string;
    challengerName: string;
    challengedId: string;
    challengedName: string;
    wager: number;
  }): PendingChallenge {
    if (this.activeMatchIdsByUserId.has(input.challengerId) || this.activeMatchIdsByUserId.has(input.challengedId)) {
      throw new Error("One of the players is already in an active match.");
    }

    const challenge: PendingChallenge = {
      id: randomUUID(),
      channelId: input.channelId,
      challengerId: input.challengerId,
      challengerName: input.challengerName,
      challengedId: input.challengedId,
      challengedName: input.challengedName,
      wager: input.wager,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    };

    this.pendingChallenges.set(challenge.id, challenge);
    return challenge;
  }

  public getPendingChallenge(challengeId: string): PendingChallenge | undefined {
    return this.pendingChallenges.get(challengeId);
  }

  public declineChallenge(challengeId: string, userId: string): PendingChallenge {
    const challenge = this.getRequiredChallenge(challengeId);

    if (challenge.challengedId !== userId && challenge.challengerId !== userId) {
      throw new Error("Only participants can decline or cancel this challenge.");
    }

    this.pendingChallenges.delete(challengeId);
    return challenge;
  }

  public acceptChallenge(challengeId: string, userId: string): PazaakMatch {
    const challenge = this.getRequiredChallenge(challengeId);

    if (challenge.challengedId !== userId) {
      throw new Error("Only the challenged player can accept this match.");
    }

    if (challenge.expiresAt < Date.now()) {
      this.pendingChallenges.delete(challengeId);
      throw new Error("This challenge has expired.");
    }

    this.pendingChallenges.delete(challengeId);

    const initialStarterIndex = Math.random() < 0.5 ? 0 : 1;
    const p1 = createPlayerState(challenge.challengerId, challenge.challengerName);
    const p2 = createPlayerState(challenge.challengedId, challenge.challengedName);
    const starter = initialStarterIndex === 0 ? p1 : p2;

    const match: PazaakMatch = {
      id: randomUUID(),
      channelId: challenge.channelId,
      publicMessageId: null,
      wager: challenge.wager,
      players: [p1, p2],
      activePlayerIndex: initialStarterIndex,
      setNumber: 1,
      mainDeck: buildMainDeck(),
      phase: "turn",
      pendingDraw: null,
      statusLine: `${starter.displayName} opens set 1.`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      turnStartedAt: Date.now(),
      initialStarterIndex,
      lastSetWinnerIndex: null,
      winnerId: null,
      winnerName: null,
      loserId: null,
      loserName: null,
      settled: false,
    };

    this.matches.set(match.id, match);
    this.activeMatchIdsByUserId.set(challenge.challengerId, match.id);
    this.activeMatchIdsByUserId.set(challenge.challengedId, match.id);
    this.safePersist(match);
    return match;
  }

  public getMatch(matchId: string): PazaakMatch | undefined {
    return this.matches.get(matchId);
  }

  public getActiveMatchForUser(userId: string): PazaakMatch | undefined {
    const matchId = this.activeMatchIdsByUserId.get(userId);
    return matchId ? this.matches.get(matchId) : undefined;
  }

  public setPublicMessageId(matchId: string, messageId: string): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    match.publicMessageId = messageId;
    match.updatedAt = Date.now();
    this.safePersist(match);
    return match;
  }

  public markSettled(matchId: string): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    match.settled = true;
    match.updatedAt = Date.now();
    this.safePersist(match);
    return match;
  }

  public draw(matchId: string, userId: string): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    const playerIndex = this.requireTurnOwner(match, userId);

    if (match.phase !== "turn") {
      throw new Error("Finish resolving the current draw before drawing again.");
    }

    const player = playerAt(match, playerIndex);

    if (player.stood) {
      throw new Error("Standing players cannot draw additional cards.");
    }

    let drawnCard = match.mainDeck.pop();

    if (drawnCard === undefined) {
      // Replenish the deck (matches HoloPazaak: _build_main_deck when empty).
      match.mainDeck = buildMainDeck();
      drawnCard = match.mainDeck.pop()!;
    }

    player.board.push({ value: drawnCard, frozen: false });
    player.total += drawnCard;
    match.pendingDraw = drawnCard;
    match.statusLine = `${player.displayName} draws ${drawnCard}.`;
    match.updatedAt = Date.now();
    match.turnStartedAt = Date.now();

    // Bust check — immediate loss, no recovery window (matches HoloPazaak engine).
    if (player.total > WIN_SCORE) {
      return this.resolveBust(match, playerIndex, `${player.displayName} busts with ${player.total}.`);
    }

    // Nine-card rule: filling the board without busting wins the set automatically.
    if (player.board.length >= MAX_BOARD_SIZE) {
      return this.resolveNineCardWin(match, playerIndex);
    }

    match.phase = "after-draw";
    this.safePersist(match);
    return match;
  }

  public stand(matchId: string, userId: string): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    const playerIndex = this.requireTurnOwner(match, userId);

    if (match.phase !== "after-draw" && match.phase !== "after-card") {
      throw new Error("You must draw before you can stand.");
    }

    const player = playerAt(match, playerIndex);
    player.stood = true;
    match.pendingDraw = null;

    if (match.players.every((entry) => entry.stood)) {
      return this.resolveStandingTotals(match);
    }

    const nextIndex = this.pickNextActiveIndex(match, playerIndex);
    const nextPlayer = playerAt(match, nextIndex);
    match.activePlayerIndex = nextIndex;
    match.phase = "turn";
    match.statusLine = `${player.displayName} stands on ${player.total}. ${nextPlayer.displayName} remains active.`;
    match.updatedAt = Date.now();
    match.turnStartedAt = Date.now();
    this.safePersist(match);
    return match;
  }

  public endTurn(matchId: string, userId: string): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    const playerIndex = this.requireTurnOwner(match, userId);
    const player = playerAt(match, playerIndex);

    if (match.phase !== "after-draw" && match.phase !== "after-card") {
      throw new Error("There is no pending draw to end yet.");
    }

    return this.finishTurn(match, playerIndex, `${player.displayName} pockets the current total.`);
  }

  public playSideCard(matchId: string, userId: string, cardId: string, appliedValue: number): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    const playerIndex = this.requireTurnOwner(match, userId);

    if (match.phase !== "after-draw") {
      throw new Error("A side card can only be played while resolving a fresh draw.");
    }

    const player = playerAt(match, playerIndex);
    const card = player.hand.find((entry) => entry.id === cardId);

    if (!card) {
      throw new Error("That side card is not in your current hand.");
    }

    if (player.usedCardIds.has(card.id)) {
      throw new Error("That side card has already been spent this set.");
    }

    // --- Validate the applied value per card type ---
    switch (card.type) {
      case "plus":
        if (appliedValue !== card.value) throw new Error("Plus cards can only be played at their printed value.");
        break;
      case "minus":
        if (appliedValue !== -card.value) throw new Error("Minus cards can only be played at their printed negative value.");
        break;
      case "flip":
        if (Math.abs(appliedValue) !== card.value) throw new Error("This card can only be played at its printed magnitude.");
        break;
      case "tiebreaker":
        if (appliedValue !== card.value) throw new Error("Tiebreaker can only be played as a positive value.");
        break;
      case "double":
      case "flip_two_four":
      case "flip_three_six":
        // appliedValue is computed by the engine, not user-chosen.
        break;
      case "plus_minus_3_6":
        if (appliedValue !== 3 && appliedValue !== -6) throw new Error("This card can only be played as +3 or −6.");
        break;
    }

    player.usedCardIds.add(card.id);

    // --- Apply the card effect ---
    let summary: string;

    if (card.type === "double") {
      // Double targets the last MAIN/PLUS/MINUS/FLIP card (skips tiebreaker, plus_minus_3_6).
      let targetIndex = -1;
      for (let i = player.board.length - 1; i >= 0; i--) {
        const src = player.board[i]!.source;
        if (src === undefined || src === "plus" || src === "minus" || src === "flip") {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex === -1) throw new Error("No valid board card to double.");
      const target = player.board[targetIndex]!;
      const bonusValue = target.value;
      target.value *= 2;
      player.total += bonusValue;
      player.sideCardsPlayed.push({ cardId: card.id, label: card.label, appliedValue: bonusValue });
      summary = `${player.displayName} plays x2 — card doubled (${bonusValue}→${target.value}).`;
    } else if (card.type === "flip_two_four" || card.type === "flip_three_six") {
      const targets = card.type === "flip_two_four" ? [2, 4] : [3, 6];
      let totalDelta = 0;
      for (const boardCard of player.board) {
        // Only MAIN/PLUS/MINUS cards are affected (matches HoloPazaak apply_flip_card_effect).
        const src = boardCard.source;
        const isFlippable = src === undefined || src === "plus" || src === "minus";
        if (!boardCard.frozen && isFlippable && targets.includes(Math.abs(boardCard.value))) {
          const oldVal = boardCard.value;
          boardCard.value = -boardCard.value;
          totalDelta += boardCard.value - oldVal;
        }
      }
      player.total += totalDelta;
      player.sideCardsPlayed.push({ cardId: card.id, label: card.label, appliedValue: totalDelta });
      const targetLabel = card.type === "flip_two_four" ? "2&4" : "3&6";
      summary = `${player.displayName} plays Flip ${targetLabel} — board adjusted by ${formatSignedValue(totalDelta)}.`;
    } else {
      // Regular value card: plus, minus, flip, tiebreaker, plus_minus_3_6
      if (card.type === "tiebreaker") {
        player.hasTiebreaker = true;
      }
      player.board.push({ value: appliedValue, frozen: false, source: card.type });
      player.total += appliedValue;
      player.sideCardsPlayed.push({ cardId: card.id, label: card.label, appliedValue });
      summary = `${player.displayName} plays ${formatSignedValue(appliedValue)} from the side deck.`;
    }

    // Bust check after side card.
    if (player.total > WIN_SCORE) {
      return this.resolveBust(match, playerIndex, `${summary} ${player.displayName} busts with ${player.total}.`);
    }

    // Nine-card rule after side card.
    if (player.board.length >= MAX_BOARD_SIZE) {
      return this.resolveNineCardWin(match, playerIndex);
    }

    // Player can still stand or end turn (matches HoloPazaak: card play does not auto-end the turn).
    match.phase = "after-card";
    match.statusLine = summary;
    match.updatedAt = Date.now();
    match.turnStartedAt = Date.now();
    this.safePersist(match);
    return match;
  }

  public forfeit(matchId: string, userId: string): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    const playerIndex = this.getParticipantIndex(match, userId);
    const opponentIndex = this.getOpponentIndex(playerIndex);
    const loser = playerAt(match, playerIndex);
    const winner = playerAt(match, opponentIndex);

    return this.completeMatch(
      match,
      opponentIndex,
      `${loser.displayName} forfeits. ${winner.displayName} takes the table.`,
    );
  }

  private finishTurn(match: PazaakMatch, playerIndex: number, summary: string): PazaakMatch {
    const player = playerAt(match, playerIndex);

    if (player.total > WIN_SCORE) {
      return this.resolveBust(match, playerIndex, `${summary} ${player.displayName} still busts with ${player.total}.`);
    }

    // Nine-card rule: filling the board without busting wins the set automatically.
    if (player.board.length >= MAX_BOARD_SIZE) {
      return this.resolveNineCardWin(match, playerIndex);
    }

    const nextIndex = this.pickNextActiveIndex(match, playerIndex);
    const nextPlayer = playerAt(match, nextIndex);
    match.activePlayerIndex = nextIndex;
    match.phase = "turn";
    match.pendingDraw = null;
    match.statusLine =
      nextIndex === playerIndex
        ? `${summary} ${player.displayName} stays active because the opposing player is already standing.`
        : `${summary} ${nextPlayer.displayName} is up.`;
    match.updatedAt = Date.now();
    match.turnStartedAt = Date.now();
    this.safePersist(match);
    return match;
  }

  private resolveBust(match: PazaakMatch, bustedPlayerIndex: number, summary: string): PazaakMatch {
    const winnerIndex = this.getOpponentIndex(bustedPlayerIndex);
    const winner = playerAt(match, winnerIndex);
    const bustedPlayer = playerAt(match, bustedPlayerIndex);
    winner.roundWins += 1;
    match.lastSetWinnerIndex = winnerIndex;

    if (winner.roundWins >= SETS_TO_WIN) {
      return this.completeMatch(
        match,
        winnerIndex,
        `${summary} ${winner.displayName} wins the match ${winner.roundWins}-${bustedPlayer.roundWins}.`,
      );
    }

    // Loser opens the next set (HoloPazaak rule).
    const starterIndex = bustedPlayerIndex;
    const starter = playerAt(match, starterIndex);
    const upcomingSet = match.setNumber + 1;
    return this.startSet(
      match,
      true,
      starterIndex,
      `${summary} ${winner.displayName} takes the set. ${starter.displayName} opens set ${upcomingSet}.`,
    );
  }

  /** Nine-card rule: filling the board without busting is an automatic set win. */
  private resolveNineCardWin(match: PazaakMatch, playerIndex: number): PazaakMatch {
    const winner = playerAt(match, playerIndex);
    const opponentIndex = this.getOpponentIndex(playerIndex);
    const loser = playerAt(match, opponentIndex);
    winner.roundWins += 1;
    match.lastSetWinnerIndex = playerIndex;

    const summary = `${winner.displayName} fills the board with ${MAX_BOARD_SIZE} cards (total ${winner.total}) — automatic set win!`;

    if (winner.roundWins >= SETS_TO_WIN) {
      return this.completeMatch(
        match,
        playerIndex,
        `${summary} ${winner.displayName} wins the match ${winner.roundWins}-${loser.roundWins}.`,
      );
    }

    // Loser opens the next set.
    const starterIndex = opponentIndex;
    const starter = playerAt(match, starterIndex);
    const upcomingSet = match.setNumber + 1;
    return this.startSet(
      match,
      true,
      starterIndex,
      `${summary} ${starter.displayName} opens set ${upcomingSet}.`,
    );
  }

  private resolveStandingTotals(match: PazaakMatch): PazaakMatch {
    const challenger = playerAt(match, 0);
    const challenged = playerAt(match, 1);

    if (challenger.total === challenged.total) {
      // Tiebreaker resolution: if exactly one player has played a Tiebreaker card, they win.
      const p0Tie = challenger.hasTiebreaker;
      const p1Tie = challenged.hasTiebreaker;

      if (p0Tie && !p1Tie) {
        // Player 0 wins via tiebreaker.
        return this.resolveSetWinner(match, 0, `${challenger.displayName} breaks the tie at ${challenger.total} with a Tiebreaker card!`);
      }

      if (p1Tie && !p0Tie) {
        // Player 1 wins via tiebreaker.
        return this.resolveSetWinner(match, 1, `${challenged.displayName} breaks the tie at ${challenged.total} with a Tiebreaker card!`);
      }

      // True tie — no set awarded. HoloPazaak reverts opener to the coin-flip player.
      const starterIndex = match.initialStarterIndex;
      const upcomingSet = match.setNumber + 1;
      const starter = playerAt(match, starterIndex);
      return this.startSet(
        match,
        true,
        starterIndex,
        `Set tied at ${challenger.total}. ${starter.displayName} opens set ${upcomingSet}.`,
      );
    }

    const winnerIndex = challenger.total > challenged.total ? 0 : 1;
    const suffix = `${playerAt(match, winnerIndex).displayName} wins the set ${playerAt(match, winnerIndex).total}-${playerAt(match, this.getOpponentIndex(winnerIndex)).total}.`;
    return this.resolveSetWinner(match, winnerIndex, suffix);
  }

  /** Common path: a player definitively wins a set (not a tie). */
  private resolveSetWinner(match: PazaakMatch, winnerIndex: number, summary: string): PazaakMatch {
    const loserIndex = this.getOpponentIndex(winnerIndex);
    const winner = playerAt(match, winnerIndex);
    const loser = playerAt(match, loserIndex);
    winner.roundWins += 1;
    match.lastSetWinnerIndex = winnerIndex;

    if (winner.roundWins >= SETS_TO_WIN) {
      return this.completeMatch(
        match,
        winnerIndex,
        `${summary} ${winner.displayName} takes the match ${winner.roundWins}-${loser.roundWins}.`,
      );
    }

    // Loser opens the next set (HoloPazaak rule).
    const starterIndex = loserIndex;
    const starter = playerAt(match, starterIndex);
    const upcomingSet = match.setNumber + 1;
    return this.startSet(
      match,
      true,
      starterIndex,
      `${summary} ${starter.displayName} opens set ${upcomingSet}.`,
    );
  }

  private startSet(
    match: PazaakMatch,
    incrementSetNumber: boolean,
    starterIndex: number,
    statusLine: string,
  ): PazaakMatch {
    if (incrementSetNumber) {
      match.setNumber += 1;
    }

    for (const player of match.players) {
      resetPlayerForSet(player);
    }

    match.mainDeck = buildMainDeck();
    match.pendingDraw = null;
    match.phase = "turn";
    match.activePlayerIndex = starterIndex;
    match.statusLine = statusLine;
    match.updatedAt = Date.now();
    match.turnStartedAt = Date.now();
    this.safePersist(match);
    return match;
  }

  private completeMatch(match: PazaakMatch, winnerIndex: number, summary: string): PazaakMatch {
    const loserIndex = this.getOpponentIndex(winnerIndex);
    const winner = playerAt(match, winnerIndex);
    const loser = playerAt(match, loserIndex);
    const challenger = playerAt(match, 0);
    const challenged = playerAt(match, 1);
    match.phase = "completed";
    match.pendingDraw = null;
    match.winnerId = winner.userId;
    match.winnerName = winner.displayName;
    match.loserId = loser.userId;
    match.loserName = loser.displayName;
    match.statusLine = summary;
    match.updatedAt = Date.now();
    this.activeMatchIdsByUserId.delete(challenger.userId);
    this.activeMatchIdsByUserId.delete(challenged.userId);
    this.safePersist(match);
    return match;
  }

  private safePersist(match: PazaakMatch): void {
    this.persistence?.save(match).catch((err) => {
      console.error("[pazaak] Failed to persist match", match.id, err);
    });
  }

  private getRequiredChallenge(challengeId: string): PendingChallenge {
    const challenge = this.pendingChallenges.get(challengeId);

    if (!challenge) {
      throw new Error("That pazaak challenge no longer exists.");
    }

    return challenge;
  }

  private getRequiredMatch(matchId: string): PazaakMatch {
    const match = this.matches.get(matchId);

    if (!match) {
      throw new Error("That pazaak match is no longer active.");
    }

    return match;
  }

  private getParticipantIndex(match: PazaakMatch, userId: string): number {
    const index = match.players.findIndex((player) => player.userId === userId);

    if (index === -1) {
      throw new Error("You are not a participant in this match.");
    }

    return index;
  }

  private requireTurnOwner(match: PazaakMatch, userId: string): number {
    if (match.phase === "completed") {
      throw new Error("This match has already been completed.");
    }

    const index = this.getParticipantIndex(match, userId);

    if (playerAt(match, match.activePlayerIndex).userId !== userId) {
      throw new Error("It is not your turn to act.");
    }

    return index;
  }

  private getOpponentIndex(playerIndex: number): number {
    return playerIndex === 0 ? 1 : 0;
  }

  private pickNextActiveIndex(match: PazaakMatch, currentIndex: number): number {
    const opponentIndex = this.getOpponentIndex(currentIndex);
    return playerAt(match, opponentIndex).stood ? currentIndex : opponentIndex;
  }
}