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

const TOKEN = process.env.DISCORD_TOKEN;
const ROLEPANEL_CHANNEL_ID = process.env.ROLEPANEL_CHANNEL_ID; // ← 例: 1433797341642489936

if (!TOKEN || !ROLEPANEL_CHANNEL_ID) {
  console.error('❌ .env に DISCORD_TOKEN または ROLEPANEL_CHANNEL_ID が設定されていません。');
  process.exit(1);
}

// アイドルロール（bot.js と同じ ID を使用）
const IDOL_ROLES = [
  { id: '1433209432581341305', name: '花海咲季' },
  { id: '1433331636514062447', name: '月村手毬' },
  { id: '1433332410623328398', name: '藤田ことね' },
  { id: '1433332920667476068', name: '有村麻央' },
  { id: '1433333171453169794', name: '葛城リーリヤ' },
  { id: '1433333415947669534', name: '倉本千奈' },
  { id: '1433333595694563429', name: '紫雲清夏' },
  { id: '1433333784270606428', name: '篠澤広' },
  { id: '1433333959378604104', name: '姫崎莉波' },
  { id: '1433334170721189989', name: '花海佑芽' },
  { id: '1433334387252138015', name: '秦谷美鈴' },
  { id: '1433334591179063316', name: '十王星南' },
  { id: '1433334807441702952', name: '雨夜燕' },
];

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

    // パネルの説明Embed
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
    // 一度メッセージを送ったら終了
    client.destroy();
  }
});

client.login(TOKEN).catch((err) => {
  console.error('❌ ログインに失敗しました:', err);
});
