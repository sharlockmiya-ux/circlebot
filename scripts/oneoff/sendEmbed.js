// sendEmbed.js
// One-off: update/send embeds for specific channels (role guide, etc.)
const { Client, GatewayIntentBits, EmbedBuilder, Events } = require('discord.js');
require('dotenv').config();

const { must, loadServerConfig } = require('../../src/config');

const TOKEN = must('DISCORD_TOKEN');
const cfg = loadServerConfig();

// === 宛先設定 ===
const DESTS = {
  role: cfg.channels?.rolepanel, // ロールチャンネル
};

// === 実行コマンドの引数 ===
// role        : ロール紹介（roleEmbedMessageId）を更新（色はロール色に同期）
// role_intro  : role と同じ（互換）
const arg = (process.argv[2] || '').trim();
if (!arg) {
  console.log('⚠️ 宛先を指定してください。例: node scripts/oneoff/sendEmbed.js role');
  process.exit(0);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

function fmtLines(lines) {
  return lines.filter(Boolean).join('\n');
}

async function safeFetchRole(guild, roleId) {
  if (!roleId) return null;
  try {
    return await guild.roles.fetch(roleId);
  } catch (e) {
    return null;
  }
}

async function buildRoleIntroEmbeds(guild) {
  // roles
  const ADMIN_ROLE_ID = cfg.roles?.admin;
  const SUBLEADER_ROLE_ID = cfg.roles?.subLeader;
  const OPERATOR_ROLE_ID = cfg.roles?.operator;
  const ENGINEER_ROLE_ID = cfg.roles?.engineer;

  const adminRole = await safeFetchRole(guild, ADMIN_ROLE_ID);
  const subRole = await safeFetchRole(guild, SUBLEADER_ROLE_ID);
  const opRole = await safeFetchRole(guild, OPERATOR_ROLE_ID);
  const engRole = await safeFetchRole(guild, ENGINEER_ROLE_ID);

  const headerColor = (adminRole && adminRole.color) ? adminRole.color : 0x5865F2;

  const embeds = [];

  // 1) Header
  embeds.push(
    new EmbedBuilder()
      .setColor(headerColor)
      .setDescription(fmtLines([
        '## **【ロール紹介】**',
        '↓ **運営ロール** ↓',
      ]))
  );

  // 2) Each staff role as its own embed (色＝ロール色)
  const roleBlocks = [
    { role: adminRole, fallbackId: ADMIN_ROLE_ID, desc: '最高管理およびサークル意思決定者' },
    { role: subRole, fallbackId: SUBLEADER_ROLE_ID, desc: 'リーダー代理' },
    { role: opRole, fallbackId: OPERATOR_ROLE_ID, desc: 'サークルの業務遂行者' },
    { role: engRole, fallbackId: ENGINEER_ROLE_ID, desc: 'サークルのテクニカルエキスパート。' },
  ].filter(b => b.fallbackId);

  for (const b of roleBlocks) {
    const mention = `<@&${b.fallbackId}>`;
    const color = (b.role && b.role.color) ? b.role.color : headerColor;

    embeds.push(
      new EmbedBuilder()
        .setColor(color)
        .setDescription(fmtLines([
          ` ${mention}`,
          ` ${b.desc}`,
        ]))
    );
  }

  // 3) Idol roles note (色＝先頭のアイドルロール色が取れればそれに合わせる)
  let idolColor = headerColor;
  const firstIdolRoleId = cfg.roles?.idols?.[0]?.roleId;
  if (firstIdolRoleId) {
    const firstIdolRole = await safeFetchRole(guild, firstIdolRoleId);
    if (firstIdolRole && firstIdolRole.color) idolColor = firstIdolRole.color;
  }

  embeds.push(
    new EmbedBuilder()
      .setColor(idolColor)
      .setDescription(fmtLines([
        '↓ **各アイドルロール** ↓',
        '各ロールは対応するアイドルを選択すると自動付与されます。',
      ]))
      .setFooter({ text: `CircleBot｜ロールガイド: 2025/12/19 20:34` })
  );

  return embeds;
}

client.once(Events.ClientReady, async () => {
  try {
    const dest = DESTS.role;
    if (!dest) throw new Error('config.channels.rolepanel が未設定です');

    const guildId = cfg.guildId;
    if (!guildId) throw new Error('config.guildId が未設定です');

    const guild = await client.guilds.fetch(guildId);
    const channel = await client.channels.fetch(dest);
    if (!channel || !channel.isTextBased()) throw new Error('宛先チャンネルが見つからない / TextBased ではありません');

    if (arg !== 'role' && arg !== 'role_intro') {
      console.log(`⚠️ 未対応の引数です: ${arg} (role / role_intro のみ対応)`);
      await client.destroy();
      return;
    }

    const embeds = await buildRoleIntroEmbeds(guild);

    const messageId = cfg.messages?.roleEmbedMessageId;
    if (messageId) {
      try {
        const msg = await channel.messages.fetch(messageId);
        await msg.edit({
          content: '',
          embeds,
          components: [],
          allowedMentions: { parse: [] },
        });
        console.log(`✅ ロール紹介メッセージを編集しました: ${messageId}`);
      } catch (e) {
        console.log('⚠️ roleEmbedMessageId のメッセージ取得/編集に失敗しました。新規送信します。', e?.message || e);
        const sent = await channel.send({
          embeds,
          allowedMentions: { parse: [] },
        });
        console.log(`✅ 送信しました。messageId = ${sent.id} (config.messages.roleEmbedMessageId に保存推奨)`);
      }
    } else {
      const sent = await channel.send({
        embeds,
        allowedMentions: { parse: [] },
      });
      console.log(`✅ 送信しました。messageId = ${sent.id} (config.messages.roleEmbedMessageId に保存推奨)`);
    }
  } catch (err) {
    console.error('❌ 送信中エラー:', err);
  } finally {
    try { await client.destroy(); } catch {}
  }
});

client.login(TOKEN);
