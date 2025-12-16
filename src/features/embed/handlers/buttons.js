const {
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

const { getOrCreateSession, resetDraft, deleteSession } = require('../sessionStore');
const { buildPreviewEmbed, buildFinalEmbed, buildBuilderComponents } = require('../ui');
const {
  clampText,
} = require('../utils');

function buildTextInput(customId, label, style, value, required = false, maxLength = 4000) {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(maxLength);

  if (value) input.setValue(value);
  return input;
}

function modalRow(component) {
  return new ActionRowBuilder().addComponents(component);
}

async function refreshPanel(interaction, session) {
  const draft = session.draft;
  const embed = buildPreviewEmbed(draft);
  const components = buildBuilderComponents(draft);
  await interaction.editReply({ embeds: [embed], components });
}

function buildFinalComponents(draft) {
  const rows = [];

  // Link buttons
  const linkButtons = Array.isArray(draft.linkButtons) ? draft.linkButtons.slice(0, 5) : [];
  if (linkButtons.length) {
    const row = new ActionRowBuilder();
    for (const b of linkButtons) {
      row.addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(clampText(b.label, 80))
          .setURL(b.url),
      );
    }
    rows.push(row);
  }

  // Select menu
  if (draft.selectMenu && Array.isArray(draft.selectMenu.options) && draft.selectMenu.options.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('embedmenu:choice')
      .setPlaceholder(draft.selectMenu.placeholder || 'Please select your choice')
      .addOptions(
        draft.selectMenu.options.slice(0, 25).map((o) => ({
          label: o.label,
          value: o.value,
          description: o.description || undefined,
        })),
      );

    rows.push(new ActionRowBuilder().addComponents(menu));
  }

  // Discordの制限（最大5行）に収める
  return rows.slice(0, 5);
}

async function handleEmbedButtons(interaction, ctx) {
  if (!interaction.isButton()) return;
  if (typeof interaction.customId !== 'string') return;
  if (!interaction.customId.startsWith('embed:')) return;

  const guildId = interaction.guildId || null;
  const channelId = interaction.channelId || null;
  const userId = interaction.user?.id;

  const session = getOrCreateSession(guildId, channelId, userId);
  const draft = session.draft;

  // ===== 1) モーダルを開く系 =====
  if (interaction.customId === 'embed:open_basic') {
    const modal = new ModalBuilder()
      .setCustomId('embed:modal:basic')
      .setTitle('Embed: 基本編集');

    // title / description / thumbnail / image / colorHex
    modal.addComponents(
      modalRow(buildTextInput('title', 'タイトル（任意）', TextInputStyle.Short, draft.title, false, 256)),
      modalRow(buildTextInput('description', '本文（任意）', TextInputStyle.Paragraph, draft.description, false, 4000)),
      modalRow(buildTextInput('thumbnailUrl', 'サムネURL（任意）', TextInputStyle.Short, draft.thumbnailUrl, false, 200)),
      modalRow(buildTextInput('imageUrl', '画像URL（任意）', TextInputStyle.Short, draft.imageUrl, false, 200)),
      modalRow(buildTextInput('colorHex', '色（#RRGGBB 任意）', TextInputStyle.Short, '', false, 20)),
    );

    await interaction.showModal(modal);
    return;
  }

  if (interaction.customId === 'embed:open_advanced') {
    const modal = new ModalBuilder()
      .setCustomId('embed:modal:advanced')
      .setTitle('Embed: 追加編集');

    // author / footer
    modal.addComponents(
      modalRow(buildTextInput('authorName', 'Author名（任意）', TextInputStyle.Short, draft.authorName, false, 256)),
      modalRow(buildTextInput('authorIconUrl', 'AuthorアイコンURL（任意）', TextInputStyle.Short, draft.authorIconUrl, false, 200)),
      modalRow(buildTextInput('authorUrl', 'AuthorリンクURL（任意）', TextInputStyle.Short, draft.authorUrl, false, 200)),
      modalRow(buildTextInput('footerText', 'Footerテキスト（任意）', TextInputStyle.Short, draft.footerText, false, 2048)),
      modalRow(buildTextInput('footerIconUrl', 'FooterアイコンURL（任意）', TextInputStyle.Short, draft.footerIconUrl, false, 200)),
    );

    await interaction.showModal(modal);
    return;
  }

  if (interaction.customId === 'embed:open_fields') {
    const modal = new ModalBuilder()
      .setCustomId('embed:modal:fields')
      .setTitle('Embed: フィールド');

    const sample = draft.fields?.length
      ? draft.fields.map((f) => `${f.name}|${f.value}|${f.inline ? 'true' : 'false'}`).join('\n')
      : '';

    modal.addComponents(
      modalRow(buildTextInput(
        'fields',
        '1行= name|value|inline(true/false)',
        TextInputStyle.Paragraph,
        sample,
        false,
        4000,
      )),
    );

    await interaction.showModal(modal);
    return;
  }

  if (interaction.customId === 'embed:open_urls') {
    const modal = new ModalBuilder()
      .setCustomId('embed:modal:urls')
      .setTitle('Embed: URL付属（本文の後ろ）');

    modal.addComponents(
      modalRow(buildTextInput(
        'appendUrlsText',
        'URLを1行ずつ（http/httpsのみ）',
        TextInputStyle.Paragraph,
        draft.appendUrlsText,
        false,
        1500,
      )),
    );

    await interaction.showModal(modal);
    return;
  }

  if (interaction.customId === 'embed:open_buttons') {
    const modal = new ModalBuilder()
      .setCustomId('embed:modal:buttons')
      .setTitle('Embed: リンクボタン');

    const sample = draft.linkButtons?.length
      ? draft.linkButtons.map((b) => `${b.label}|${b.url}`).join('\n')
      : '';

    modal.addComponents(
      modalRow(buildTextInput(
        'buttons',
        '1行= label|url（最大5）',
        TextInputStyle.Paragraph,
        sample,
        false,
        1500,
      )),
    );

    await interaction.showModal(modal);
    return;
  }

  if (interaction.customId === 'embed:open_select') {
    const modal = new ModalBuilder()
      .setCustomId('embed:modal:select')
      .setTitle('Embed: セレクトメニュー');

    const sample = draft.selectMenu?.options?.length
      ? draft.selectMenu.options.map((o) => `${o.label}|${o.value}|${o.description || ''}`).join('\n')
      : '';

    modal.addComponents(
      modalRow(buildTextInput(
        'placeholder',
        '表示テキスト（任意）',
        TextInputStyle.Short,
        draft.selectMenu?.placeholder || '',
        false,
        100,
      )),
      modalRow(buildTextInput(
        'options',
        '1行= label|value|description（最大25）',
        TextInputStyle.Paragraph,
        sample,
        false,
        4000,
      )),
    );

    await interaction.showModal(modal);
    return;
  }

  // ===== 2) パネル内操作系（deferUpdateしてパネルを更新） =====
  if (interaction.customId === 'embed:toggle_timestamp') {
    await interaction.deferUpdate();
    session.draft.timestamp = !session.draft.timestamp;
    await refreshPanel(interaction, session);
    return;
  }

  if (interaction.customId === 'embed:clear') {
    await interaction.deferUpdate();
    const keepTargetChannelId = session.draft?.targetChannelId || channelId;
    resetDraft(session);
    // 送信先は維持（クリアで誤爆しないように）
    session.draft.targetChannelId = keepTargetChannelId;
    await refreshPanel(interaction, session);
    return;
  }

  if (interaction.customId === 'embed:cancel') {
    await interaction.deferUpdate();
    deleteSession(guildId, channelId, userId);
    await interaction.editReply({
      embeds: [],
      components: [],
      content: 'キャンセルしました。',
    });
    return;
  }

  if (interaction.customId === 'embed:send') {
    // 送信は時間がかかる可能性があるので deferUpdate
    await interaction.deferUpdate();

    const t = Date.now();
    if (session.cooldownUntil && t < session.cooldownUntil) {
      // パネルはそのまま
      return;
    }
    session.cooldownUntil = t + 5000; // 5秒クールダウン
    // 送信先：選択チャンネル（未指定なら実行ch）
    let channel = null;

    const wantedId = draft.targetChannelId || channelId;
    if (wantedId && interaction.guild) {
      // cache → fetch の順（失敗しても落とさない）
      channel = interaction.guild.channels?.cache?.get?.(wantedId) || null;
      if (!channel) {
        try {
          channel = await interaction.guild.channels.fetch(wantedId);
        } catch (e) {
          channel = null;
        }
      }
    }

    // fallback: 実行したチャンネル
    if (!channel) channel = interaction.channel;

    if (!channel || typeof channel.send !== 'function') {
      await interaction.editReply({
        content: '❌ 送信先チャンネルが取得できません。',
        embeds: [],
        components: [],
      });
      return;
    }

    // テキスト投稿できないチャンネルは弾く（フォーラム等）
    if (typeof channel.isTextBased === 'function' && !channel.isTextBased()) {
      await interaction.editReply({
        content: '❌ 選択した送信先には投稿できません（テキストチャンネルを選択してください）。',
        embeds: [],
        components: [],
      });
      return;
    }

    const embed = buildFinalEmbed(draft);
    const components = buildFinalComponents(draft);
    const content = draft.appendUrlsText ? draft.appendUrlsText : undefined;

    // Discord API: 空のEmbedは送れない（50035 Invalid Form Body）。
    // content がある場合は embed を省略して送る。
    const embedJson = embed.toJSON();
    const isEmptyEmbed = !embedJson || Object.keys(embedJson).length === 0;

    if (isEmptyEmbed && !content) {
      await interaction.editReply({
        content: '❌ 送信内容が空です。タイトル/本文などを入力してください。',
        embeds: [],
        components: [],
      });
      return;
    }

    try {
      const payload = { content, components };
      if (!isEmptyEmbed) payload.embeds = [embed];
      await channel.send(payload);
    } catch (err) {
      console.error('❌ /embed send error:', err);
      await interaction.editReply({
        content: '❌ 送信に失敗しました。',
        embeds: [],
        components: [],
      });
      return;
    }

    // 送信後はパネルを再描画（そのまま継続編集可能）
    await refreshPanel(interaction, session);
    return;
  }
}

module.exports = { handleEmbedButtons };
