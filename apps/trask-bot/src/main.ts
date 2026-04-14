import "dotenv/config";

import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import OpenAI from "openai";

import { loadTraskBotConfig } from "@openkotor/config";
import { createBotClient, createLogger, deployGuildCommands, toErrorMessage } from "@openkotor/core";
import { buildErrorEmbed, buildInfoEmbed, buildSuccessEmbed } from "@openkotor/discord-ui";
import { personaProfiles } from "@openkotor/personas";
import { createChunkSearchProvider, defaultSourceCatalog, type SearchHit, type SourceKind } from "@openkotor/retrieval";

const logger = createLogger("trask-bot");
const config = loadTraskBotConfig();
const searchProvider = createChunkSearchProvider(config.chunkDir);
const openai = config.ai.openAiApiKey
  ? new OpenAI({ apiKey: config.ai.openAiApiKey })
  : null;

// ---------------------------------------------------------------------------
// LLM answer generation — used when an OpenAI key is configured
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `\
You are Trask Ulgo, a KOTOR community helper — direct, practical, no-nonsense.
Answer questions about Star Wars: Knights of the Old Republic using only the
provided source excerpts. Always cite the source name in your answer.
If the excerpts do not contain enough information, say so plainly.
Limit your answer to 300 words.
`.trim();

const generateLlmAnswer = async (query: string, hits: readonly SearchHit[]): Promise<string | null> => {
  if (!openai || hits.length === 0) return null;

  const context = hits
    .slice(0, 5)
    .map((hit, i) => `[${i + 1}] ${hit.sourceName}\n${hit.snippet}\nURL: ${hit.url}`)
    .join("\n\n");

  try {
    const response = await openai.chat.completions.create({
      model: config.ai.chatModel,
      max_tokens: 500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Question: ${query}\n\nSources:\n${context}` },
      ],
    });
    return response.choices[0]?.message.content?.trim() ?? null;
  } catch (err) {
    logger.warn("OpenAI call failed, falling back to catalog summary.", err);
    return null;
  }
};

const sourceChoices = defaultSourceCatalog.map((source) => ({
  name: source.name,
  value: source.id,
}));

const askCommand = new SlashCommandBuilder()
  .setName("ask")
  .setDescription("Ask Trask to search the approved KOTOR source registry.")
  .addStringOption((option) => {
    return option
      .setName("query")
      .setDescription("What should Trask look up?")
      .setRequired(true)
      .setMaxLength(200);
  });

const sourcesCommand = new SlashCommandBuilder()
  .setName("sources")
  .setDescription("List the currently approved source catalog Trask can search.")
  .addStringOption((option) => {
    return option
      .setName("kind")
      .setDescription("Optionally filter by source type.")
      .addChoices(
        { name: "Website", value: "website" },
        { name: "GitHub", value: "github" },
        { name: "Discord", value: "discord" },
      )
      .setRequired(false);
  });

const reindexCommand = new SlashCommandBuilder()
  .setName("queue-reindex")
  .setDescription("Queue a source refresh job in the ingest worker stub.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((option) => {
    return option
      .setName("source")
      .setDescription("Queue one known source id, or leave blank for all sources.")
      .addChoices(...sourceChoices)
      .setRequired(false);
  });

const commands = [askCommand, sourcesCommand, reindexCommand] as const;

const summarizeHits = (query: string, hits: readonly SearchHit[]): string => {
  const intro = `I checked the approved source registry for \`${query}\`.`;

  if (hits.length === 0) {
    return `${intro} I do not have a seeded match yet. Try a narrower tool, project, or troubleshooting phrase.`;
  }

  return `${intro} Start with the strongest matches below. This first pass searches the local source catalog; live scrape and semantic indexing come next.`;
};

const handleAskCommand = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const query = interaction.options.getString("query", true);

  await interaction.deferReply();

  const hits = await searchProvider.search(query, 5);
  const llmAnswer = await generateLlmAnswer(query, hits);

  const description = llmAnswer ?? summarizeHits(query, hits);

  const embed = buildInfoEmbed({
    title: `${personaProfiles.trask.displayName} Briefing`,
    description,
    fields: hits.slice(0, 5).map((hit, index) => ({
      name: `${index + 1}. ${hit.sourceName}`,
      value: `${hit.snippet}\n${hit.url}`,
      inline: false,
    })),
  });

  await interaction.editReply({
    embeds: [embed],
    allowedMentions: { parse: [] },
  });
};

const handleSourcesCommand = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const requestedKind = interaction.options.getString("kind", false) as SourceKind | null;
  const sources = await searchProvider.listSources();
  const filtered = requestedKind ? sources.filter((source) => source.kind === requestedKind) : sources;

  const embed = buildInfoEmbed({
    title: "Approved Source Registry",
    description: `Trask currently knows about ${filtered.length} approved sources${requestedKind ? ` of type ${requestedKind}` : ""}.`,
    fields: filtered.slice(0, 10).map((source) => ({
      name: source.name,
      value: `${source.description}\nPolicy: ${source.freshnessPolicy}`,
      inline: false,
    })),
  });

  await interaction.reply({
    embeds: [embed],
    allowedMentions: { parse: [] },
  });
};

const handleReindexCommand = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const sourceId = interaction.options.getString("source", false);
  const result = await searchProvider.queueReindex(sourceId ? [sourceId] : undefined);

  const embed = buildSuccessEmbed({
    title: "Refresh Queued",
    description: `Queued ${result.queuedSourceIds.length} source refresh request(s) in stub mode. The ingest worker implementation is the next phase.`,
  });

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
};

const dispatchChatCommand = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  switch (interaction.commandName) {
    case "ask":
      await handleAskCommand(interaction);
      break;
    case "sources":
      await handleSourcesCommand(interaction);
      break;
    case "queue-reindex":
      await handleReindexCommand(interaction);
      break;
    default:
      await interaction.reply({
        embeds: [
          buildErrorEmbed({
            title: "Unknown Command",
            description: `Trask does not recognize /${interaction.commandName}.`,
          }),
        ],
        ephemeral: true,
      });
  }
};

const client = createBotClient({ guildMessages: true, messageContent: true });

client.once("ready", (readyClient) => {
  logger.info("Trask is online.", {
    user: readyClient.user.tag,
    approvedGuildCount: config.allowedGuildIds.length,
    approvedChannelCount: config.approvedChannelIds.length,
  });
});

const isAllowedGuild = (guildId: string | null): boolean => {
  if (config.allowedGuildIds.length === 0) return true;
  return guildId !== null && config.allowedGuildIds.includes(guildId);
};

const isAllowedChannel = (channelId: string): boolean => {
  if (config.approvedChannelIds.length === 0) return true;
  return config.approvedChannelIds.includes(channelId);
};

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (!isAllowedGuild(interaction.guildId)) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed({
          title: "Not Available Here",
          description: "Trask is not authorized to operate in this guild.",
        }),
      ],
      ephemeral: true,
    });
    return;
  }

  // Channel restriction only applies to /ask (the content-producing command).
  if (interaction.commandName === "ask" && !isAllowedChannel(interaction.channelId)) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed({
          title: "Wrong Channel",
          description: "Trask can only answer questions in approved channels. Check the channel list with `/sources`.",
        }),
      ],
      ephemeral: true,
    });
    return;
  }

  try {
    await dispatchChatCommand(interaction);
  } catch (error) {
    logger.error("Trask command failed.", error);

    const payload = {
      embeds: [
        buildErrorEmbed({
          title: "Operation Failed",
          description: `I ran into a problem: ${toErrorMessage(error)}`,
        }),
      ],
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
      return;
    }

    await interaction.reply(payload);
  }
});

const deployables = commands.map((command) => command.toJSON() as RESTPostAPIApplicationCommandsJSONBody);
await deployGuildCommands(config.discord, deployables, logger);
await client.login(config.discord.botToken);