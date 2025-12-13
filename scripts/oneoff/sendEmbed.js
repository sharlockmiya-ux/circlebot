// sendEmbed.js
const { Client, GatewayIntentBits,  EmbedBuilder, Events } = require('discord.js');
require('dotenv').config();

const { must, loadServerConfig } = require('../../src/config');

const TOKEN = must('DISCORD_TOKEN');
const cfg = loadServerConfig();

// === 宛先設定（優先：config / 互換：env） ===
const DESTS = {
  role: cfg.channels?.rolepanel, // ロールチャンネル
};

// === 実行コマンドの引数 ===
const arg = (process.argv[2] || '').trim();
if (!arg) {
  console.log('⚠️ 宛先を指定してください。例: node sendEmbed.js role');
  process.exit(0);
}

// === 実行対象チャンネル ===
const channelId = DESTS[arg];
if (!channelId) {
  console.log(`❌ 不明な宛先: ${arg}`);
  process.exit(1);
}

// === role IDs（優先：config / 互換：元ID） ===
const ADMIN_ROLE_ID = cfg.roles?.admin;
const SUBLEADER_ROLE_ID = cfg.roles?.subLeader;
const OPERATOR_ROLE_ID = cfg.roles?.operator;

if (!ADMIN_ROLE_ID || !SUBLEADER_ROLE_ID || !OPERATOR_ROLE_ID) {
  console.error('❌ config.roles.admin / subLeader / operator のいずれかが不足しています。');
  process.exit(1);
}

// === Embed メッセージ内容（本文不変） ===
const embed = new EmbedBuilder()
  .setColor(0x5865f2)
  .setTitle("**【ロール紹介】**")
  .setDescription([
    "↓ **運営ロール** ↓",
    `<@&${ADMIN_ROLE_ID}>\n> 最高管理およびサークル意思決定者`,
    `<@&${SUBLEADER_ROLE_ID}>\n> リーダー代理`,
    `<@&${OPERATOR_ROLE_ID}>\n> サークルの業務遂行者`,
    "",
    "↓ **各アイドルロール** ↓",
    "各ロールは対応するアイドルを選択すると自動付与されます。"
  ].join("\n"))
  .setFooter({ text: "CircleBot｜ロールガイド" })
  .setTimestamp();

// === Botクライアント起動 ===
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  console.log(`✅ ログイン完了: ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) throw new Error('チャンネルが見つかりません');
    if (!channel.isTextBased || !channel.isTextBased()) throw new Error('チャンネルが見つかりません');

    await channel.send({ embeds: [embed] });
    console.log(`✅ 送信成功: ${channelId}`);
  } catch (err) {
    console.error('❌ 送信失敗:', err);
  } finally {
    client.destroy();
  }
});

client.login(TOKEN);
