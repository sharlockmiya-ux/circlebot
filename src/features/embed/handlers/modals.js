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

async function ensureDeferred(interaction) {
  if (interaction.deferred || interaction.replied) return;
  // モーダル submit は 3 秒以内に応答が必要。
  // 入力が大きい場合でも Unknown interaction になりにくくするため、先に defer しておく。
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
}

async function replyWithPanel(interaction, session) {
  const draft = session.draft;
  const embed = buildPreviewEmbed(draft);
  const components = buildBuilderComponents(draft);

  await interaction.editReply({
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

  // 先に defer（3秒制限対策）
  await ensureDeferred(interaction);

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

  // 想定外（何もせず終わると Interaction failed になるので最低限返す）
  await interaction.editReply({
    content: '❌ エラーが発生しました。',
    embeds: [],
    components: [],
  });
}

module.exports = { handleEmbedModals };
