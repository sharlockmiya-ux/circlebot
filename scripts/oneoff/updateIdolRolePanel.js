// updateIdolRolePanel.js
// 既存の「✅ 担当アイドルロール」パネルメッセージを探して、ボタンだけ最新の roles.idols に同期して更新します。
// - 本文（埋め込みの文言）は変更しない方針：既存Embedをそのまま流用し、components のみ差し替えます。

require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
} = require('discord.js');

const { must, loadServerConfig } = require('../../src/config');

const TOKEN = must('DISCORD_TOKEN');
const cfg = loadServerConfig();

const ROLEPANEL_CHANNEL_ID = cfg.channels?.rolepanel;
const GUILD_ID = cfg.guildId;

if (!ROLEPANEL_CHANNEL_ID || !GUILD_ID) {
  console.error('❌ config.guildId / config.channels.rolepanel が不足しています。');
  process.exit(1);
}

// roles.idols からボタンを構築
const IDOL_DEFS = cfg.roles?.idols;
if (!Array.isArray(IDOL_DEFS) || IDOL_DEFS.length === 0) {
  console.error('❌ server config に roles.idols がありません。');
  process.exit(1);
}

const IDOL_ROLES = IDOL_DEFS.map(({ label, roleId }) => ({ id: roleId, name: label }));

function buildRows() {
  // Discordの制限：1行あたり最大5ボタン、最大5行（合計25）
  const rows = [];
  for (let i = 0; i < IDOL_ROLES.length; i += 5) {
    const slice = IDOL_ROLES.slice(i, i + 5);
    const row = new ActionRowBuilder().addComponents(
      ...slice.map((idol) =>
        new ButtonBuilder()
          .setCustomId(`role:${idol.id}`)
          .setLabel(idol.name)
          .setStyle(ButtonStyle.Secondary),
      ),
    );
    rows.push(row);
  }
  return rows;
}

async function findTargetMessage(channel, botUserId) {
  // 直近100件から、「✅ 担当アイドルロール」Embedを持つ bot 投稿を探す
  // （見つからない場合は null）
  const messages = await channel.messages.fetch({ limit: 100 });
  const candidates = [...messages.values()]
    .filter((m) => m.author?.id === botUserId)
    .filter((m) => Array.isArray(m.embeds) && m.embeds.some((e) => e?.title === '✅ 担当アイドルロール'))
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  return candidates[0] || null;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await client.channels.fetch(ROLEPANEL_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      throw new Error('rolepanel が見つからない / TextBased ではありません');
    }

    // 既存パネルメッセージを特定
    const target = await findTargetMessage(channel, client.user.id);
    if (!target) {
      console.log('⚠️ 既存のパネルメッセージが見つかりませんでした。新規送信します。');
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('✅ 担当アイドルロール')
        .setDescription(
          [
            '下のボタンから、担当しているアイドルのロールを選択してください。',
            '',
            '・同じボタンをもう一度押すと、そのアイドルのロールは解除されます。',
            '・複数名の担当を選択することも可能です。',
          ].join('\n'),
        );

      await channel.send({
        embeds: [embed],
        components: buildRows(),
        allowedMentions: { parse: [] },
      });
      console.log('✅ 新規パネルメッセージを送信しました。');
      return;
    }

    // Embed本文は触らず、components だけ更新
    await target.edit({
      embeds: target.embeds,
      components: buildRows(),
      allowedMentions: { parse: [] },
    });

    console.log(`✅ アイドルロールパネルを更新しました: ${target.id}`);
  } catch (err) {
    console.error('❌ 更新中エラー:', err);
  } finally {
    try { await client.destroy(); } catch {}
  }
});

client.login(TOKEN).catch((err) => {
  console.error('❌ ログインに失敗しました:', err);
});
