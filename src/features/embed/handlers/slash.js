const { MessageFlags } = require('discord.js');
const { getOrCreateSession } = require('../sessionStore');
const { buildPreviewEmbed, buildBuilderComponents } = require('../ui');

async function handleEmbedSlash(interaction, ctx) {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'embed') return;

  const guildId = interaction.guildId || null;
  const channelId = interaction.channelId || null;
  const userId = interaction.user?.id;

  const session = getOrCreateSession(guildId, channelId, userId);
  const draft = session.draft;

  const embed = buildPreviewEmbed(draft);
  const components = buildBuilderComponents(draft);

  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [embed],
    components,
  });
}

module.exports = { handleEmbedSlash };
