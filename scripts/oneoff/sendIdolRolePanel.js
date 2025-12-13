// sendIdolRolePanel.js
// アイドル担当ロールパネルを一度だけ送信する専用スクリプト

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

// 送信先（優先：config / 互換：env）
const ROLEPANEL_CHANNEL_ID = cfg.channels?.rolepanel;

if (!TOKEN || !ROLEPANEL_CHANNEL_ID) {
  console.error('❌ DISCORD_TOKEN または config.channels.rolepanel が設定されていません。');
  process.exit(1);
}

// アイドルロール（IDは server config に集約）
const IDOL_DEFS = cfg.roles?.idols;
if (!Array.isArray(IDOL_DEFS) || IDOL_DEFS.length === 0) {
  console.error('❌ server config に roles.idols がありません。');
  process.exit(1);
}

const IDOL_ROLES = IDOL_DEFS.map(({ label, roleId }) => ({ id: roleId, name: label }));

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(ROLEPANEL_CHANNEL_ID);
    if (!channel) {
      console.error('❌ ROLEPANEL_CHANNEL_ID のチャンネルが見つかりません。');
      process.exit(1);
    }
    if (!channel.isTextBased || !channel.isTextBased()) {
      console.error('❌ ROLEPANEL_CHANNEL_ID のチャンネルがテキストチャンネルではありません。');
      process.exit(1);
    }

    // パネルの説明Embed（本文不変）
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

    // ボタンを5つずつの行に分割して並べる
    const rows = [];
    for (let i = 0; i < IDOL_ROLES.length; i += 5) {
      const slice = IDOL_ROLES.slice(i, i + 5);
      const row = new ActionRowBuilder().addComponents(
        ...slice.map((idol) =>
          new ButtonBuilder()
            // 新形式: role:<ロールID> でトグル処理
            .setCustomId(`role:${idol.id}`)
            .setLabel(idol.name)
            .setStyle(ButtonStyle.Secondary),
        ),
      );
      rows.push(row);
    }

    await channel.send({
      embeds: [embed],
      components: rows,
    });

    console.log('✅ アイドル担当ロールパネルを送信しました。');
  } catch (err) {
    console.error('❌ パネル送信中にエラーが発生しました:', err);
  } finally {
    client.destroy();
  }
});

client.login(TOKEN).catch((err) => {
  console.error('❌ ログインに失敗しました:', err);
});
