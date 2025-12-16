const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
} = require('discord.js');

const COLOR_PRESETS = [
  { label: '🟥 Red (#e74c3c)', value: 'e74c3c', color: 0xe74c3c },
  { label: '🟧 Orange (#e67e22)', value: 'e67e22', color: 0xe67e22 },
  { label: '🟨 Yellow (#f1c40f)', value: 'f1c40f', color: 0xf1c40f },
  { label: '🟩 Green (#2ecc71)', value: '2ecc71', color: 0x2ecc71 },
  { label: '🟦 Blue (#3498db)', value: '3498db', color: 0x3498db },
  { label: '🟪 Purple (#9b59b6)', value: '9b59b6', color: 0x9b59b6 },
  { label: '🟫 Brown (#8e6e53)', value: '8e6e53', color: 0x8e6e53 },
  { label: '⬛ Black (#2c3e50)', value: '2c3e50', color: 0x2c3e50 },
  { label: '⬜ Gray (#95a5a6)', value: '95a5a6', color: 0x95a5a6 },
];

function buildEmbedFromDraft(draft, { includeHints = false } = {}) {
  const e = new EmbedBuilder();

  if (draft.title) e.setTitle(draft.title);
  if (draft.description) e.setDescription(draft.description);
  if (typeof draft.color === 'number') e.setColor(draft.color);

  if (draft.timestamp) e.setTimestamp(new Date());

  if (draft.authorName) {
    const author = { name: draft.authorName };
    if (draft.authorIconUrl) author.iconURL = draft.authorIconUrl;
    if (draft.authorUrl) author.url = draft.authorUrl;
    e.setAuthor(author);
  }

  if (draft.thumbnailUrl) e.setThumbnail(draft.thumbnailUrl);
  if (draft.imageUrl) e.setImage(draft.imageUrl);

  if (draft.footerText) {
    const footer = { text: draft.footerText };
    if (draft.footerIconUrl) footer.iconURL = draft.footerIconUrl;
    e.setFooter(footer);
  }

  if (Array.isArray(draft.fields) && draft.fields.length) {
    for (const f of draft.fields.slice(0, 25)) {
      e.addFields({
        name: f.name,
        value: f.value,
        inline: !!f.inline,
      });
    }
  }

  if (includeHints) {
    const hints = [];
    if (draft.appendUrlsText) hints.push('URL付属: ON');
    if (draft.linkButtons?.length) hints.push(`リンクボタン: ${draft.linkButtons.length}`);
    if (draft.selectMenu) hints.push('セレクト: ON');

    if (hints.length) {
      e.addFields({
        name: '\u200B',
        value: `設定: ${hints.join(' / ')}`,
      });
    }
  }

  return e;
}

function buildPreviewEmbed(draft) {
  const e = buildEmbedFromDraft(draft, { includeHints: true });

  // Discord API: 空のEmbed（{}）は送信できず 50035 になる。
  // 初期状態でもプレビューが表示できるように最低限の本文を入れる。
  const json = e.toJSON();
  if (!json || Object.keys(json).length === 0) {
    e.setDescription('下のボタンから内容を編集してください。');
  }

  return e;
}

function buildFinalEmbed(draft) {
  return buildEmbedFromDraft(draft, { includeHints: false });
}

function buildBuilderComponents(draft) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('embed:open_basic').setLabel('基本編集').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('embed:open_advanced').setLabel('追加編集').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('embed:open_fields').setLabel('フィールド').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('embed:open_urls').setLabel('URL付属').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('embed:open_buttons').setLabel('ボタン').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('embed:open_select').setLabel('セレクト').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('embed:toggle_timestamp')
      .setLabel(draft.timestamp ? 'Timestamp: ON' : 'Timestamp: OFF')
      .setStyle(draft.timestamp ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('embed:clear').setLabel('クリア').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('embed:send').setLabel('送信').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('embed:cancel').setLabel('キャンセル').setStyle(ButtonStyle.Secondary),
  );

  // 送信先チャンネル（同じパネルで別chへ送れる）
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('embed:target_channel')
    .setPlaceholder('送信先チャンネル（未指定=現在のチャンネル）')
    .setMinValues(1)
    .setMaxValues(1)
    .setChannelTypes([ChannelType.GuildText, ChannelType.GuildAnnouncement]);

  if (draft?.targetChannelId) {
    try {
      channelSelect.setDefaultChannels(draft.targetChannelId);
    } catch (_) {
      // default 設定に失敗しても落とさない
    }
  }

  const row3 = new ActionRowBuilder().addComponents(channelSelect);

  const colorSelect = new StringSelectMenuBuilder()
    .setCustomId('embed:color')
    .setPlaceholder('色（カラー）を選択（指定なし可）');

  // discord.js v14 の StringSelectMenuBuilder には setDefaultValues が無い。
  // 代わりに option の default: true で選択状態を表現する。
  let defaultValue = null;
  if (typeof draft.color === 'number') {
    const hex = draft.color.toString(16).padStart(6, '0').toLowerCase();
    const match = COLOR_PRESETS.find((c) => c.value === hex);
    if (match) defaultValue = match.value;
  }

  colorSelect.setOptions([
    { label: '指定なし', value: 'none' },
    ...COLOR_PRESETS.map((c) => ({
      label: c.label,
      value: c.value,
      default: defaultValue === c.value,
    })),
  ]);

  const row4 = new ActionRowBuilder().addComponents(colorSelect);

  return [row1, row2, row3, row4];
}

function presetColorToInt(value) {
  if (!value || value === 'none') return null;
  const p = COLOR_PRESETS.find((c) => c.value === value);
  return p ? p.color : null;
}

module.exports = {
  buildPreviewEmbed,
  buildFinalEmbed,
  buildBuilderComponents,
  presetColorToInt,
};
