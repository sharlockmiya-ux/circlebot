// scripts/editRoleEmbed.js （改行調整バージョン）

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, Events } = require('discord.js');

const { must, loadServerConfig } = require('../src/config');

const TOKEN = must('DISCORD_TOKEN');
const cfg = loadServerConfig();
const CHANNEL_ID = cfg.channels?.rolepanel;
const MESSAGE_ID = cfg.messages?.roleEmbedMessageId;

if (!CHANNEL_ID || !MESSAGE_ID) {
  console.error('❌ config.channels.rolepanel または config.messages.roleEmbedMessageId が不足しています。');
  process.exit(1);
}

// 技術者ロールの行（変更なし）
const NEW_BLOCK = [
  '<@&' + cfg.roles.engineer + '>',
  '> サークルのテクニカルエキスパート。'
].join('\n');

// 参謀ロール（この直後に入れる）
const ANCHOR = [
  '<@&' + cfg.roles.operator + '>',
  '> サークルの業務遂行者'
].join('\n');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    const msg = await channel.messages.fetch(MESSAGE_ID);
    if (msg.author.id !== client.user.id) throw new Error('Botの投稿ではありません。');

    const orig = msg.embeds?.[0];
    const e = EmbedBuilder.from(orig);
    let desc = e.data.description ?? '';

    // 「参謀」の下に空行が2つある場合は1つ削除
    desc = desc.replace(`${ANCHOR}\n\n${NEW_BLOCK}`, `${ANCHOR}\n${NEW_BLOCK}`);

    // 念のため置き換え（空行が1つでもズレていた場合にも対応）
    e.setDescription(desc);
    await msg.edit({ embeds: [e] });

    console.log('✅ 段落調整完了：空白行を削除しました。');
  } catch (err) {
    console.error('❌ エラー:', err);
  } finally {
    client.destroy();
  }
});

client.login(TOKEN);

