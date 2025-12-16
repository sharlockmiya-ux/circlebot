const { MessageFlags } = require('discord.js');
const { getOrCreateSession, updateDraft } = require('../sessionStore');
const { buildPreviewEmbed, buildBuilderComponents, presetColorToInt } = require('../ui');

async function handleEmbedSelects(interaction, ctx) {
  if (!interaction.isStringSelectMenu() && !interaction.isChannelSelectMenu()) return;
  if (typeof interaction.customId !== 'string') return;

  // ===== ビルダーパネル：送信先チャンネル選択 =====
  if (interaction.isChannelSelectMenu() && interaction.customId === 'embed:target_channel') {
    const guildId = interaction.guildId || null;
    const channelId = interaction.channelId || null;
    const userId = interaction.user?.id;

    const session = getOrCreateSession(guildId, channelId, userId);

    const chosen = interaction.values?.[0] || null;
    updateDraft(session, { targetChannelId: chosen });

    await interaction.deferUpdate();

    const embed = buildPreviewEmbed(session.draft);
    const components = buildBuilderComponents(session.draft);
    await interaction.editReply({ embeds: [embed], components });
    return;
  }

  // ===== ビルダーパネル：色選択 =====
  if (interaction.customId === 'embed:color') {
    const guildId = interaction.guildId || null;
    const channelId = interaction.channelId || null;
    const userId = interaction.user?.id;

    const session = getOrCreateSession(guildId, channelId, userId);

    const chosen = interaction.values?.[0] || 'none';
    const color = presetColorToInt(chosen);

    updateDraft(session, { color });

    await interaction.deferUpdate();

    const embed = buildPreviewEmbed(session.draft);
    const components = buildBuilderComponents(session.draft);
    await interaction.editReply({ embeds: [embed], components });
    return;
  }

  // ===== 最終メッセージ：任意のセレクトメニュー =====
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('embedmenu:')) {
    const val = interaction.values?.[0] || '';
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: val ? `選択: ${val}` : '選択されました。',
    });
    return;
  }
}

module.exports = { handleEmbedSelects };
