const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;

// === 宛先設定 ===
const DESTS = {
  role: process.env.ROLEPANEL_CHANNEL_ID, // ロールチャンネル
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

// === Embed メッセージ内容 ===
const embed = new EmbedBuilder()
  .setColor(0x5865f2)
  .setTitle("**【ロール紹介】**")
  .setDescription([
    "↓ **運営ロール** ↓",
    "<@&1434074658059190343>\n> 最高管理およびサークル意思決定者",
    "<@&1432727570419548323>\n> リーダー代理",
    "<@&1431975448119607316>\n> サークルの業務遂行者",
    "",
    "↓ **各アイドルロール** ↓",
    "各ロールは対応するアイドルを選択すると自動付与されます。"
  ].join("\n"))
  .setFooter({ text: "CircleBot｜ロールガイド" })
  .setTimestamp();

// === Botクライアント起動 ===
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`✅ ログイン完了: ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) throw new Error('チャンネルが見つかりません');

    await channel.send({ embeds: [embed] });
    console.log(`✅ 送信成功: ${channelId}`);
  } catch (err) {
    console.error('❌ 送信失敗:', err);
  } finally {
    client.destroy();
  }
});

client.login(TOKEN);
