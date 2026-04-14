import "dotenv/config";

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageEditOptions,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";

import { loadDeadeyeBotConfig } from "@openkotor/config";
import { createBotClient, createLogger, deployGuildCommands, toErrorMessage } from "@openkotor/core";
import { asBulletList, buildErrorEmbed, buildInfoEmbed, buildSuccessEmbed, buildWarningEmbed } from "@openkotor/discord-ui";
import { JsonWalletRepository, resolveDataFile, type RivalryRecord } from "@openkotor/persistence";
import { personaProfiles } from "@openkotor/personas";

import {
  PazaakCoordinator,
  getCurrentPlayer,
  getOpponentForUser,
  getPlayerForUser,
  getSideCardOptionsForPlayer,
  renderBoardLine,
  renderHandLine,
  HAND_SIZE,
  SETS_TO_WIN,
  MAX_BOARD_SIZE,
  WIN_SCORE,
  SIDE_DECK_SIZE,
  type PazaakMatch,
  type PendingChallenge,
} from "./pazaak.js";
import { MatchStore } from "./match-store.js";

const logger = createLogger("deadeye-duncan-bot");
const config = loadDeadeyeBotConfig();
const walletRepository = new JsonWalletRepository(resolveDataFile(config.dataDir, "wallets.json"), config.startingCredits);
const matchStore = new MatchStore(config.dataDir);
const coordinator = new PazaakCoordinator(matchStore);

const pazaakCommand = new SlashCommandBuilder()
  .setName("pazaak")
  .setDescription("Deadeye Duncan runs a fake-credit pazaak table.")
  .addSubcommand((subcommand) => subcommand.setName("rules").setDescription("Explain the current pazaak ruleset."))
  .addSubcommand((subcommand) => subcommand.setName("wallet").setDescription("Show your current Deadeye wallet."))
  .addSubcommand((subcommand) => subcommand.setName("daily").setDescription("Claim your daily login bonus from the table."))
  .addSubcommand((subcommand) => subcommand.setName("leaderboard").setDescription("Show the richest pazaak players in the current wallet file."))
  .addSubcommand((subcommand) => subcommand.setName("rivalry").setDescription("Show your full rivalry history at the pazaak table."))
  .addSubcommand((subcommand) => {
    return subcommand
      .setName("challenge")
      .setDescription("Challenge another player to a pazaak match.")
      .addUserOption((option) => {
        return option
          .setName("opponent")
          .setDescription("Who should Deadeye throw into the ring with you?")
          .setRequired(true);
      })
      .addIntegerOption((option) => {
        return option
          .setName("wager")
          .setDescription("How many fake credits are on the table?")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(5000);
      });
  });

const pazaakAdminCommand = new SlashCommandBuilder()
  .setName("pazaak-admin")
  .setDescription("Admin controls for the Deadeye pazaak table.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("give")
      .setDescription("Add credits to a player's wallet.")
      .addUserOption((option) =>
        option.setName("player").setDescription("Who receives the credits?").setRequired(true),
      )
      .addIntegerOption((option) =>
        option.setName("amount").setDescription("How many credits to add?").setRequired(true).setMinValue(1).setMaxValue(1_000_000),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("take")
      .setDescription("Remove credits from a player's wallet (floored at 0).")
      .addUserOption((option) =>
        option.setName("player").setDescription("Whose credits are being removed?").setRequired(true),
      )
      .addIntegerOption((option) =>
        option.setName("amount").setDescription("How many credits to remove?").setRequired(true).setMinValue(1).setMaxValue(1_000_000),
      ),
  );

const buildRulesEmbed = () => {
  return buildInfoEmbed({
    title: `${personaProfiles.deadeye.displayName} Explains The Rules`,
    description: "Look, these are the KOTOR-flavored house rules on this table. Try not to laugh if I lose again.",
    fields: [
      {
        name: "Match Flow",
        value: asBulletList([
          `Each match is first to ${SETS_TO_WIN} sets.`,
          `Each set aims to get closer to ${WIN_SCORE} without going over.`,
          "A tie starts another set with fresh side cards — unless one player has a Tiebreaker card.",
          "The loser of a set goes first in the next set. On a tie, the coin-flip opener resumes.",
        ]),
        inline: false,
      },
      {
        name: "Decks",
        value: asBulletList([
          "The main deck contains four copies of cards 1 through 10.",
          `Each player gets a ${SIDE_DECK_SIZE}-card sideboard at match start.`,
          `${HAND_SIZE} side cards are drawn from the sideboard each set.`,
          "Side cards include fixed (+/−), flip (±), Tiebreaker, x2 Double, and board-flip specials.",
        ]),
        inline: false,
      },
      {
        name: "Turns",
        value: asBulletList([
          "On your turn, you must draw from the main deck first.",
          `If the draw puts you over ${WIN_SCORE}, you bust and lose the set immediately.`,
          "If you don't bust, you may play one side card, then stand or end the turn.",
          `Filling all ${MAX_BOARD_SIZE} board slots without busting wins the set automatically.`,
        ]),
        inline: false,
      },
    ],
  });
};

const buildWalletEmbed = async (userId: string, displayName: string) => {
  const wallet = await walletRepository.getWallet(userId, displayName);
  const rivalry: RivalryRecord | undefined = walletRepository.topRivalry(wallet);

  const fields = [
    {
      name: "Record",
      value: `Wins: ${wallet.wins}\nLosses: ${wallet.losses}`,
      inline: true,
    },
    {
      name: "Streak",
      value: `Current: ${wallet.streak}\nBest: ${wallet.bestStreak}`,
      inline: true,
    },
  ];

  if (rivalry) {
    fields.push({
      name: "Top Rivalry",
      value: `${rivalry.opponentName}: ${rivalry.wins}W-${rivalry.losses}L`,
      inline: true,
    });
  }

  const nextDailyMs = wallet.lastDailyAt
    ? Math.max(0, new Date(wallet.lastDailyAt).getTime() + config.dailyCooldownMs - Date.now())
    : 0;
  const dailyNote = nextDailyMs > 0
    ? `Daily bonus available in ${Math.ceil(nextDailyMs / 3_600_000)}h.`
    : "Daily bonus is available — claim it with \`/pazaak daily\`.";

  return buildInfoEmbed({
    title: `${displayName}'s Wallet`,
    description: `I hate that this proves you're doing better than me. Current balance: **${wallet.balance} credits**.\n${dailyNote}`,
    fields,
  });
};

// Streak multiplier tiers: 0-1 = 1x, 2-4 = 1.25x, 5-9 = 1.5x, 10+ = 2x
const streakMultiplier = (streak: number): number => {
  if (streak >= 10) return 2;
  if (streak >= 5) return 1.5;
  if (streak >= 2) return 1.25;
  return 1;
};

const buildDailyEmbed = async (userId: string, displayName: string) => {
  const wallet = await walletRepository.getWallet(userId, displayName);
  const multiplier = streakMultiplier(wallet.wins);
  const scaledBonus = Math.round(config.dailyBonusCredits * multiplier);
  const result = await walletRepository.claimDailyBonus(userId, displayName, scaledBonus, config.dailyCooldownMs);

  if (!result.credited) {
    const hoursLeft = Math.ceil((result.nextEligibleAt - Date.now()) / 3_600_000);
    return buildWarningEmbed({
      title: "Already Claimed",
      description: `You already grabbed today's credits. Try again in about ${hoursLeft}h. I would say I'm impressed by your patience, but I'd be lying.`,
    });
  }

  const bonusNote = multiplier > 1
    ? ` That's a **${multiplier}x streak bonus** on your ${wallet.wins}-win run.`
    : "";

  return buildSuccessEmbed({
    title: "Daily Bonus Claimed",
    description: `Deadeye slides **${result.amount} credits** across the table. You don't deserve them, but there you go.${bonusNote}`,
  });
};

const buildRivalryEmbed = async (userId: string, displayName: string) => {
  const wallet = await walletRepository.getWallet(userId, displayName);
  const rivalries = walletRepository.allRivalries(wallet);

  if (rivalries.length === 0) {
    return buildInfoEmbed({
      title: `${displayName}'s Rivalry Record`,
      description: "You have not played enough matches to build a rivalry. Get to the table.",
    });
  }

  return buildInfoEmbed({
    title: `${displayName}'s Rivalry Record`,
    description: `${rivalries.length} opponent${rivalries.length === 1 ? "" : "s"} on record. These are the people Deadeye has watched you embarrass yourself against.`,
    fields: rivalries.slice(0, 10).map((r) => ({
      name: r.opponentName,
      value: `${r.wins}W–${r.losses}L (${r.wins + r.losses} matches)`,
      inline: true,
    })),
  });
};

const buildLeaderboardEmbed = async () => {
  const wallets = await walletRepository.listWallets();

  return buildInfoEmbed({
    title: "Pazaak Leaderboard",
    description: wallets.length > 0 ? "Somehow these people keep winning fake money." : "No one has touched the table yet.",
    fields: wallets.slice(0, 10).map((wallet, index) => ({
      name: `${index + 1}. ${wallet.displayName}`,
      value: `Balance: ${wallet.balance}\nRecord: ${wallet.wins}-${wallet.losses}`,
      inline: true,
    })),
  });
};

const buildChallengeEmbed = (challenge: PendingChallenge) => {
  return buildInfoEmbed({
    title: "Pazaak Challenge",
    description: `${challenge.challengerName} just challenged ${challenge.challengedName} for **${challenge.wager} credits**. Somebody is about to embarrass me by being competent.`,
  });
};

const buildChallengeComponents = (challenge: PendingChallenge) => {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`deadeye:challenge:accept:${challenge.id}`)
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deadeye:challenge:decline:${challenge.id}`)
        .setLabel("Decline")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
};

const buildMatchEmbed = (match: PazaakMatch) => {
  const activePlayer = getCurrentPlayer(match);

  return buildInfoEmbed({
    title: "Deadeye Duncan's Pazaak Table",
    description: `${match.statusLine}\nSet ${match.setNumber}. Wager: **${match.wager} credits**.`,
    fields: match.players.map((player) => ({
      name: `${player.displayName}${match.phase !== "completed" && activePlayer.userId === player.userId ? " (active)" : ""}`,
      value: `${renderBoardLine(player)}\nSets won: ${player.roundWins}\nSide cards left: ${player.hand.length - player.usedCardIds.size}\nStatus: ${player.stood ? "Standing" : "Still drawing"}`,
      inline: true,
    })),
  });
};

const buildMatchComponents = (match: PazaakMatch) => {
  if (match.phase === "completed") {
    if (!match.winnerId || !match.loserId) {
      return [];
    }

    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`deadeye:rematch:${match.loserId}:${match.winnerId}:${match.wager}`)
          .setLabel("Rematch")
          .setStyle(ButtonStyle.Primary),
      ),
    ];
  }

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`deadeye:controls:${match.id}`)
        .setLabel("Open Controls")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`deadeye:forfeit:${match.id}`)
        .setLabel("Forfeit")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
};

const chunkButtons = (buttons: ButtonBuilder[]) => {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let index = 0; index < buttons.length; index += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(index, index + 5)));
  }

  return rows;
};

const buildPrivateControlsPayload = async (match: PazaakMatch, userId: string) => {
  const player = getPlayerForUser(match, userId);

  if (!player) {
    return {
      embeds: [
        buildErrorEmbed({
          title: "Not Your Match",
          description: "You can spectate from the channel, but only the two players get a hand at the table.",
        }),
      ],
      components: [],
    };
  }

  const opponent = getOpponentForUser(match, userId)!;
  const currentPlayer = getCurrentPlayer(match);
  const handLine = renderHandLine(player) || "No side cards drawn.";
  const wallet = await walletRepository.getWallet(player.userId, player.displayName);
  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  let description = `Balance: **${wallet.balance} credits**\nYour hand: ${handLine}`;

  if (match.phase === "completed") {
    description = `${description}\n\nResult: ${match.statusLine}`;
  } else if (currentPlayer.userId !== userId) {
    description = `${description}\n\n${opponent.displayName} is holding the turn right now. Try not to look shocked.`;
  } else if (match.phase === "turn") {
    description = `${description}\n\nIt is your move. Draw from the main deck.`;
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`deadeye:draw:${match.id}`).setLabel("Draw").setStyle(ButtonStyle.Primary),
      ),
    );
  } else if (match.phase === "after-card") {
    description = `${description}\n\n${match.statusLine} Stand on ${player.total} or end the turn.`;

    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`deadeye:endturn:${match.id}`)
          .setLabel("End Turn")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`deadeye:stand:${match.id}`)
          .setLabel("Stand")
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  } else {
    description = `${description}\n\nYou drew ${match.pendingDraw}. Play a side card, stand on ${player.total}, or end the turn.`;

    const sideCardButtons = getSideCardOptionsForPlayer(player).map((option) => {
      return new ButtonBuilder()
        .setCustomId(`deadeye:play:${match.id}:${option.cardId}:${option.appliedValue}`)
        .setLabel(option.displayLabel)
        .setStyle(ButtonStyle.Success);
    });

    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`deadeye:endturn:${match.id}`)
          .setLabel("End Turn")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`deadeye:stand:${match.id}`)
          .setLabel("Stand")
          .setStyle(ButtonStyle.Secondary),
      ),
    );
    components.push(...chunkButtons(sideCardButtons));
  }

  return {
    embeds: [
      buildInfoEmbed({
        title: "Private Pazaak Controls",
        description,
        fields: [
          {
            name: "Your Table State",
            value: `Cards: ${renderBoardLine(player)}\nSets won: ${player.roundWins}`,
            inline: true,
          },
          {
            name: `${opponent.displayName}`,
            value: `Cards: ${renderBoardLine(opponent)}\nSets won: ${opponent.roundWins}`,
            inline: true,
          },
        ],
      }),
    ],
    components,
  };
};

const client = createBotClient();

const refreshBoardMessage = async (match: PazaakMatch): Promise<void> => {
  if (!match.publicMessageId) {
    return;
  }

  const channel = await client.channels.fetch(match.channelId);

  if (!channel?.isTextBased() || !("messages" in channel)) {
    return;
  }

  const message = await channel.messages.fetch(match.publicMessageId);
  const payload: MessageEditOptions = {
    embeds: [buildMatchEmbed(match)],
    components: buildMatchComponents(match),
  };
  await message.edit(payload);
};

const settleCompletedMatch = async (match: PazaakMatch): Promise<void> => {
  if (match.phase !== "completed" || match.settled || !match.winnerId || !match.winnerName || !match.loserId || !match.loserName) {
    return;
  }

  await walletRepository.recordMatch({
    winnerId: match.winnerId,
    winnerName: match.winnerName,
    loserId: match.loserId,
    loserName: match.loserName,
    wager: match.wager,
  });
  coordinator.markSettled(match.id);
};

const handleAdminCommand = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const subcommand = interaction.options.getSubcommand(true);
  const player = interaction.options.getUser("player", true);
  const amount = interaction.options.getInteger("amount", true);
  const delta = subcommand === "give" ? amount : -amount;

  const updated = await walletRepository.adjustBalance(player.id, player.displayName, delta);

  const verb = subcommand === "give" ? "added" : "removed";
  const prep = subcommand === "give" ? "to" : "from";

  await interaction.reply({
    embeds: [
      buildSuccessEmbed({
        title: "Balance Adjusted",
        description: `${amount} credits ${verb} ${prep} ${player.displayName}'s wallet. New balance: **${updated.balance} credits**.`,
      }),
    ],
    ephemeral: true,
  });
};

const handleSlashCommand = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  if (!interaction.inGuild()) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed({
          title: "Guild Required",
          description: "Deadeye only runs the table inside a guild channel.",
        }),
      ],
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand(true);

  switch (subcommand) {
    case "rules": {
      await interaction.reply({ embeds: [buildRulesEmbed()] });
      return;
    }

    case "wallet": {
      await interaction.reply({
        embeds: [await buildWalletEmbed(interaction.user.id, interaction.user.displayName)],
        ephemeral: true,
      });
      return;
    }

    case "daily": {
      await interaction.reply({
        embeds: [await buildDailyEmbed(interaction.user.id, interaction.user.displayName)],
        ephemeral: true,
      });
      return;
    }

    case "leaderboard": {
      await interaction.reply({ embeds: [await buildLeaderboardEmbed()] });
      return;
    }

    case "rivalry": {
      await interaction.reply({
        embeds: [await buildRivalryEmbed(interaction.user.id, interaction.user.displayName)],
        ephemeral: true,
      });
      return;
    }

    case "challenge": {
      const opponent = interaction.options.getUser("opponent", true);
      const wager = interaction.options.getInteger("wager", true);

      if (opponent.bot) {
        await interaction.reply({
          embeds: [
            buildWarningEmbed({
              title: "Challenge Rejected",
              description: "I already lose enough to organics. I am not adding bot mirrors to the humiliation stack.",
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      if (opponent.id === interaction.user.id) {
        await interaction.reply({
          embeds: [
            buildWarningEmbed({
              title: "Challenge Rejected",
              description: "Even I know better than to let you hustle yourself.",
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      const challengerWallet = await walletRepository.getWallet(interaction.user.id, interaction.user.displayName);
      const challengedWallet = await walletRepository.getWallet(opponent.id, opponent.displayName);

      if (challengerWallet.balance < wager) {
        await interaction.reply({
          embeds: [
            buildWarningEmbed({
              title: "Insufficient Credits",
              description: `You tried to wager ${wager}, but you only have ${challengerWallet.balance}. This is somehow worse than one of my duels.`,
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      if (challengedWallet.balance < wager) {
        await interaction.reply({
          embeds: [
            buildWarningEmbed({
              title: "Opponent Cannot Cover Wager",
              description: `${opponent.displayName} only has ${challengedWallet.balance} credits available. Lower the stake if you want a legal embarrassment.`,
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      const challenge = coordinator.createChallenge({
        channelId: interaction.channelId,
        challengerId: interaction.user.id,
        challengerName: interaction.user.displayName,
        challengedId: opponent.id,
        challengedName: opponent.displayName,
        wager,
      });

      await interaction.reply({
        embeds: [buildChallengeEmbed(challenge)],
        components: buildChallengeComponents(challenge),
        allowedMentions: { parse: [] },
      });
      return;
    }

    default: {
      await interaction.reply({
        embeds: [
          buildErrorEmbed({
            title: "Unknown Subcommand",
            description: `I do not know how to process ${subcommand}.`,
          }),
        ],
        ephemeral: true,
      });
    }
  }
};

const handleButtonInteraction = async (interaction: ButtonInteraction): Promise<void> => {
  const parts = interaction.customId.split(":");

  if (parts[0] !== "deadeye") {
    return;
  }

  const action = parts[1];

  switch (action) {
    case "challenge": {
      const resolution = parts[2];
      const challengeId = parts[3];

      if (!challengeId) {
        throw new Error("Malformed challenge identifier.");
      }

      if (resolution === "decline") {
        const declined = coordinator.declineChallenge(challengeId, interaction.user.id);
        await interaction.update({
          embeds: [
            buildWarningEmbed({
              title: "Challenge Closed",
              description: `${declined.challengedName} declined the wager. Honestly, probably the smart call.`,
            }),
          ],
          components: [],
        });
        return;
      }

      if (resolution === "accept") {
        const match = coordinator.acceptChallenge(challengeId, interaction.user.id);
        coordinator.setPublicMessageId(match.id, interaction.message.id);
        await interaction.update({
          embeds: [buildMatchEmbed(match)],
          components: buildMatchComponents(match),
        });
        await interaction.followUp({
          ...(await buildPrivateControlsPayload(match, interaction.user.id)),
          ephemeral: true,
        });
      }

      return;
    }

    case "controls": {
      const matchId = parts[2];

      if (!matchId) {
        throw new Error("Malformed controls identifier.");
      }

      const match = coordinator.getMatch(matchId);

      if (!match) {
        await interaction.reply({
          embeds: [
            buildErrorEmbed({
              title: "Match Missing",
              description: "This table no longer exists. I probably misplaced it.",
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        ...(await buildPrivateControlsPayload(match, interaction.user.id)),
        ephemeral: true,
      });
      return;
    }

    case "forfeit": {
      const matchId = parts[2];

      if (!matchId) {
        throw new Error("Malformed forfeit identifier.");
      }

      const match = coordinator.forfeit(matchId, interaction.user.id);
      await settleCompletedMatch(match);
      await interaction.update({
        embeds: [buildMatchEmbed(match)],
        components: buildMatchComponents(match),
      });
      return;
    }

    case "rematch": {
      const challengerId = parts[2];
      const challengedId = parts[3];
      const wager = Number(parts[4]);

      if (!challengerId || !challengedId || Number.isNaN(wager)) {
        throw new Error("Malformed rematch payload.");
      }

      if (interaction.user.id !== challengerId && interaction.user.id !== challengedId) {
        await interaction.reply({
          embeds: [buildErrorEmbed({ title: "Not a Participant", description: "Only the two players can request a rematch." })],
          ephemeral: true,
        });
        return;
      }

      const challWallet = await walletRepository.getWallet(challengerId, interaction.user.id === challengerId ? interaction.user.displayName : "Challenger");
      const challedWallet = await walletRepository.getWallet(challengedId, interaction.user.id === challengedId ? interaction.user.displayName : "Challenged");

      if (challWallet.balance < wager || challedWallet.balance < wager) {
        await interaction.reply({
          embeds: [buildWarningEmbed({
            title: "Insufficient Credits",
            description: `One of you cannot cover the ${wager}-credit rematch stake. Lower those bets if you want to embarrass yourselves again.`,
          })],
          ephemeral: true,
        });
        return;
      }

      const rematchChallenge = coordinator.createChallenge({
        channelId: interaction.channelId,
        challengerId,
        challengerName: challWallet.displayName,
        challengedId,
        challengedName: challedWallet.displayName,
        wager,
      });

      await interaction.update({
        embeds: [buildChallengeEmbed(rematchChallenge)],
        components: buildChallengeComponents(rematchChallenge),
      });
      return;
    }

    case "draw":
    case "stand":
    case "endturn":
    case "play": {
      const matchId = parts[2];

      if (!matchId) {
        throw new Error("Malformed match identifier.");
      }

      let match: PazaakMatch;

      if (action === "draw") {
        match = coordinator.draw(matchId, interaction.user.id);
      } else if (action === "stand") {
        match = coordinator.stand(matchId, interaction.user.id);
      } else if (action === "endturn") {
        match = coordinator.endTurn(matchId, interaction.user.id);
      } else {
        const cardId = parts[3];
        const appliedValue = Number(parts[4]);

        if (!cardId || Number.isNaN(appliedValue)) {
          throw new Error("Malformed side card payload.");
        }

        match = coordinator.playSideCard(matchId, interaction.user.id, cardId, appliedValue);
      }

      await settleCompletedMatch(match);
      await refreshBoardMessage(match);
      await interaction.update(await buildPrivateControlsPayload(match, interaction.user.id));
      return;
    }

    default:
      return;
  }
};

client.once("ready", (readyClient) => {
  logger.info("Deadeye Duncan is online.", {
    user: readyClient.user.tag,
    startingCredits: config.startingCredits,
    dataDir: config.dataDir,
  });
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "pazaak") {
      await handleSlashCommand(interaction);
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === "pazaak-admin") {
      await handleAdminCommand(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
    }
  } catch (error) {
    logger.error("Deadeye interaction failed.", error);

    const payload = {
      embeds: [
        buildErrorEmbed({
          title: "Table Error",
          description: `Something went wrong at the table: ${toErrorMessage(error)}`,
        }),
      ],
      ephemeral: true,
    };

    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  }
});

const deployables = [
  pazaakCommand.toJSON() as RESTPostAPIApplicationCommandsJSONBody,
  pazaakAdminCommand.toJSON() as RESTPostAPIApplicationCommandsJSONBody,
];
await deployGuildCommands(config.discord, deployables, logger);
await coordinator.initialize();

// Turn timer: auto-forfeit the active player if they stall longer than the timeout.
// Runs every 60 seconds; also prunes stale match files once per hour (every 60th tick).
let timerTick = 0;
setInterval(() => {
  timerTick += 1;

  for (const match of coordinator.getActiveMatches()) {
    if (Date.now() - match.turnStartedAt > config.turnTimeoutMs) {
      const activePlayer = getCurrentPlayer(match);
      try {
        const forfeited = coordinator.forfeit(match.id, activePlayer.userId);
        settleCompletedMatch(forfeited).then(() => refreshBoardMessage(forfeited)).catch((err) => {
          logger.error("Turn-timer board refresh failed.", err);
        });
      } catch (err) {
        logger.error("Turn-timer forfeit failed.", err);
      }
    }
  }

  if (timerTick % 60 === 0) {
    matchStore.prune().then((removed) => {
      if (removed > 0) logger.info("Pruned stale match files.", { removed });
    }).catch((err) => {
      logger.error("Match file prune failed.", err);
    });
  }
}, 60_000);

await client.login(config.discord.botToken);