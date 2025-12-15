const { MessageFlags } = require('discord.js');
const { getOrCreateSession, updateDraft } = require('../sessionStore');
const { buildPreviewEmbed, buildBuilderComponents } = require('../ui');
const {
  parseColorToInt,
  parseButtonsMultiline,
  parseUrlsMultiline,
  parseFieldsMultiline,
  parseSelectMenu,
  isHttpUrl,
  clampText,
} = require('../utils');

function safeUrlOrEmpty(url) {
  const u = String(url ?? '').trim();
  if (!u) return '';
  return isHttpUrl(u) ? u : '';
}

async function replyWithPanel(interaction, session) {
  const draft = session.draft;
  const embed = buildPreviewEmbed(draft);
  const components = buildBuilderComponents(draft);

  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [embed],
    components,
  });
}

async function handleEmbedModals(interaction, ctx) {
  if (!interaction.isModalSubmit()) return;
  if (typeof interaction.customId !== 'string') return;
  if (!interaction.customId.startsWith('embed:modal:')) return;

  const guildId = interaction.guildId || null;
  const channelId = interaction.channelId || null;
  const userId = interaction.user?.id;

  const session = getOrCreateSession(guildId, channelId, userId);

  // ===== basic =====
  if (interaction.customId === 'embed:modal:basic') {
    const title = clampText(interaction.fields.getTextInputValue('title') || '', 256);
    const description = clampText(interaction.fields.getTextInputValue('description') || '', 4000);
    const thumbnailUrl = safeUrlOrEmpty(interaction.fields.getTextInputValue('thumbnailUrl'));
    const imageUrl = safeUrlOrEmpty(interaction.fields.getTextInputValue('imageUrl'));

    const colorHex = (interaction.fields.getTextInputValue('colorHex') || '').trim();
    const color = colorHex ? (parseColorToInt(colorHex) ?? session.draft.color) : session.draft.color;

    updateDraft(session, { title, description, thumbnailUrl, imageUrl, color });
    await replyWithPanel(interaction, session);
    return;
  }

  // ===== advanced =====
  if (interaction.customId === 'embed:modal:advanced') {
    const authorName = clampText(interaction.fields.getTextInputValue('authorName') || '', 256);
    const authorIconUrl = safeUrlOrEmpty(interaction.fields.getTextInputValue('authorIconUrl'));
    const authorUrl = safeUrlOrEmpty(interaction.fields.getTextInputValue('authorUrl'));

    const footerText = clampText(interaction.fields.getTextInputValue('footerText') || '', 2048);
    const footerIconUrl = safeUrlOrEmpty(interaction.fields.getTextInputValue('footerIconUrl'));

    updateDraft(session, { authorName, authorIconUrl, authorUrl, footerText, footerIconUrl });
    await replyWithPanel(interaction, session);
    return;
  }

  // ===== fields =====
  if (interaction.customId === 'embed:modal:fields') {
    const raw = interaction.fields.getTextInputValue('fields') || '';
    const { fields } = parseFieldsMultiline(raw, 25);
    updateDraft(session, { fields });
    await replyWithPanel(interaction, session);
    return;
  }

  // ===== urls =====
  if (interaction.customId === 'embed:modal:urls') {
    const raw = interaction.fields.getTextInputValue('appendUrlsText') || '';
    const appendUrlsText = parseUrlsMultiline(raw, 1500);
    updateDraft(session, { appendUrlsText });
    await replyWithPanel(interaction, session);
    return;
  }

  // ===== buttons =====
  if (interaction.customId === 'embed:modal:buttons') {
    const raw = interaction.fields.getTextInputValue('buttons') || '';
    const { buttons } = parseButtonsMultiline(raw, 5);
    updateDraft(session, { linkButtons: buttons });
    await replyWithPanel(interaction, session);
    return;
  }

  // ===== select =====
  if (interaction.customId === 'embed:modal:select') {
    const placeholder = interaction.fields.getTextInputValue('placeholder') || '';
    const raw = interaction.fields.getTextInputValue('options') || '';
    const { selectMenu } = parseSelectMenu(raw, placeholder, 25);
    updateDraft(session, { selectMenu });
    await replyWithPanel(interaction, session);
    return;
  }
}

module.exports = { handleEmbedModals };
