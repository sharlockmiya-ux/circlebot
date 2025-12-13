// sendAnnouncementRole.js
// お知らせロール付与パネルを「ロールチャンネル」に一度だけ送信する専用スクリプト

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

// ★新：サーバー設定（ID類）をconfigから読む
const { must, loadServerConfig } = require('./src/config');

const TOKEN = must('DISCORD_TOKEN');
const cfg = loadServerConfig();

// 送信先チャンネルID（優先：config / 互換：env）
const CHANNEL_ID = cfg.channels?.rolepanel || process.env.ROLEPANEL_CHANNEL_ID; // アイドルロールと同じチャンネル

// 🔔 お知らせロールID（優先：config / 互換：直書きフォールバック）
const ANNOUNCE_ROLE_ID = cfg.roles?.announcement || '1435924112160587856';

if (!TOKEN || !CHANNEL_ID || !ANNOUNCE_ROLE_ID) {
  console.error('❌ DISCORD_TOKEN / ROLEPANEL_CHANNEL_ID / ANNOUNCE_ROLE_ID のいずれかが不足しています。');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`✅ ログイン完了: ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) throw new Error('チャンネルが見つかりません');
    if (!channel.isTextBased || !channel.isTextBased()) throw new Error('チャンネルが見つかりません');

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('🔔 お知らせロール')
      .setDescription([
        'お知らせを受け取りたい方は、このメッセージのロールボタンをタップしてください。',
        '連絡チャンネルで通知を受け取れるようになります。',
      ].join('\n'))
      .setFooter({ text: 'CircleBot｜お知らせ設定' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`role_on:${ANNOUNCE_ROLE_ID}`)
        .setLabel('お知らせを受け取る')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`role_off:${ANNOUNCE_ROLE_ID}`)
        .setLabel('通知をオフにする')
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embed], components: [row] });
    console.log('✅ お知らせロールパネルを送信しました');
  } catch (err) {
    console.error('❌ 送信失敗:', err);
  } finally {
    client.destroy();
  }
});

client.login(TOKEN);

