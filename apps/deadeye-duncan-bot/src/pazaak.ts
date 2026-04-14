import { randomUUID } from "node:crypto";

export type SideCardMode = "fixed" | "flex";

export interface SideCard {
  id: string;
  label: string;
  value: number;
  mode: SideCardMode;
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

export interface MatchPlayerState {
  userId: string;
  displayName: string;
  roundWins: number;
  hand: SideCard[];
  usedCardIds: Set<string>;
  board: number[];
  sideCardsPlayed: AppliedSideCard[];
  total: number;
  stood: boolean;
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
  phase: "turn" | "after-draw" | "completed";
  pendingDraw: number | null;
  statusLine: string;
  createdAt: number;
  updatedAt: number;
  /** Timestamp when the current active player's decision window opened. Reset on every action. */
  turnStartedAt: number;
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

const sideDeckLibrary: readonly SideCard[] = [
  { id: "pm1", label: "+/-1", value: 1, mode: "flex" },
  { id: "pm2", label: "+/-2", value: 2, mode: "flex" },
  { id: "pm3", label: "+/-3", value: 3, mode: "flex" },
  { id: "pm6", label: "+/-6", value: 6, mode: "flex" },
  { id: "plus4", label: "+4", value: 4, mode: "fixed" },
  { id: "minus4", label: "-4", value: -4, mode: "fixed" },
  { id: "plus5", label: "+5", value: 5, mode: "fixed" },
  { id: "minus5", label: "-5", value: -5, mode: "fixed" },
  { id: "plus6", label: "+6", value: 6, mode: "fixed" },
  { id: "minus6", label: "-6", value: -6, mode: "fixed" },
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

const drawMatchHand = (): SideCard[] => {
  return shuffle(sideDeckLibrary).slice(0, 4).map(cloneCard);
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
  return {
    userId,
    displayName,
    roundWins: 0,
    hand: drawMatchHand(),
    usedCardIds: new Set<string>(),
    board: [],
    sideCardsPlayed: [],
    total: 0,
    stood: false,
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
  return player.board.length > 0 ? `${player.board.join(" + ")} = **${player.total}**` : "No cards in play";
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

    if (card.mode === "fixed") {
      options.push({
        cardId: card.id,
        displayLabel: `Play ${formatSignedValue(card.value)}`,
        appliedValue: card.value,
      });
      continue;
    }

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
  }

  return options;
};

const resetPlayerForSet = (player: MatchPlayerState): void => {
  player.board = [];
  player.sideCardsPlayed = [];
  player.total = 0;
  player.stood = false;
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

    const match: PazaakMatch = {
      id: randomUUID(),
      channelId: challenge.channelId,
      publicMessageId: null,
      wager: challenge.wager,
      players: [
        createPlayerState(challenge.challengerId, challenge.challengerName),
        createPlayerState(challenge.challengedId, challenge.challengedName),
      ],
      activePlayerIndex: 0,
      setNumber: 1,
      mainDeck: buildMainDeck(),
      phase: "turn",
      pendingDraw: null,
      statusLine: `${challenge.challengerName} opens set 1.`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      turnStartedAt: Date.now(),
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

    const drawnCard = match.mainDeck.pop();

    if (drawnCard === undefined) {
      throw new Error("The main deck was exhausted unexpectedly.");
    }

    player.board.push(drawnCard);
    player.total += drawnCard;
    match.pendingDraw = drawnCard;
    match.phase = "after-draw";
    match.statusLine = `${player.displayName} draws ${drawnCard}.`;
    match.updatedAt = Date.now();
    match.turnStartedAt = Date.now();

    const recoveryAvailable = getSideCardOptionsForPlayer(player).some(
      (option) => player.total + option.appliedValue <= 20,
    );

    if (player.total > 20 && !recoveryAvailable) {
      return this.resolveBust(match, playerIndex, `${player.displayName} busts with ${player.total}.`);
    }

    this.safePersist(match);
    return match;
  }

  public stand(matchId: string, userId: string): PazaakMatch {
    const match = this.getRequiredMatch(matchId);
    const playerIndex = this.requireTurnOwner(match, userId);

    if (match.phase !== "turn") {
      throw new Error("You cannot stand while a draw is still being resolved.");
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

    if (match.phase !== "after-draw") {
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
      throw new Error("That side card has already been spent this match.");
    }

    if (card.mode === "fixed" && card.value !== appliedValue) {
      throw new Error("Fixed side cards can only be played at their printed value.");
    }

    if (card.mode === "flex" && Math.abs(appliedValue) !== card.value) {
      throw new Error("Flexible side cards can only be played at their printed magnitude.");
    }

    player.usedCardIds.add(card.id);
    player.sideCardsPlayed.push({
      cardId: card.id,
      label: card.label,
      appliedValue,
    });
    player.total += appliedValue;

    return this.finishTurn(
      match,
      playerIndex,
      `${player.displayName} plays ${formatSignedValue(appliedValue)} from the side deck.`,
    );
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

    if (player.total > 20) {
      return this.resolveBust(match, playerIndex, `${summary} ${player.displayName} still busts with ${player.total}.`);
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

    if (winner.roundWins >= 3) {
      return this.completeMatch(
        match,
        winnerIndex,
        `${summary} ${winner.displayName} wins the match ${winner.roundWins}-${bustedPlayer.roundWins}.`,
      );
    }

    const upcomingSet = match.setNumber + 1;
    const starterIndex = (upcomingSet - 1) % 2;
    const starter = playerAt(match, starterIndex);
    return this.startSet(
      match,
      true,
      `${summary} ${winner.displayName} takes the set. ${starter.displayName} opens set ${upcomingSet}.`,
    );
  }

  private resolveStandingTotals(match: PazaakMatch): PazaakMatch {
    const challenger = playerAt(match, 0);
    const challenged = playerAt(match, 1);

    if (challenger.total === challenged.total) {
      const upcomingSet = match.setNumber + 1;
      const starterIndex = (upcomingSet - 1) % 2;
      const starter = playerAt(match, starterIndex);
      return this.startSet(
        match,
        true,
        `Set tied at ${challenger.total}. ${starter.displayName} opens set ${upcomingSet}.`,
      );
    }

    const winnerIndex = challenger.total > challenged.total ? 0 : 1;
    const loserIndex = this.getOpponentIndex(winnerIndex);
    const winner = playerAt(match, winnerIndex);
    const loser = playerAt(match, loserIndex);
    winner.roundWins += 1;

    if (winner.roundWins >= 3) {
      return this.completeMatch(
        match,
        winnerIndex,
        `${winner.displayName} wins the final set and takes the match ${winner.roundWins}-${loser.roundWins}.`,
      );
    }

    const upcomingSet = match.setNumber + 1;
    const starterIndex = (upcomingSet - 1) % 2;
    const starter = playerAt(match, starterIndex);
    return this.startSet(
      match,
      true,
      `${winner.displayName} takes the set. ${starter.displayName} opens set ${upcomingSet}.`,
    );
  }

  private startSet(match: PazaakMatch, incrementSetNumber: boolean, statusLine: string): PazaakMatch {
    if (incrementSetNumber) {
      match.setNumber += 1;
    }

    for (const player of match.players) {
      resetPlayerForSet(player);
    }

    match.mainDeck = buildMainDeck();
    match.pendingDraw = null;
    match.phase = "turn";
    match.activePlayerIndex = (match.setNumber - 1) % 2;
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