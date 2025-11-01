// --- tiny health server for Render ---
const http = require('http');
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(PORT, () => console.log(`✅ Health server on ${PORT}`));
// --- end tiny health server ---

// ===== CircleBot (CommonJS) =====
console.log("Boot: starting bot.js");

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Events,
  PermissionFlagsBits
} = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

if (!TOKEN || !CHANNEL_ID) {
  console.error("❌ .env に DISCORD_TOKEN または CHANNEL_ID がありません。");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// === ロールボタン設定 ===
const ROLE_BUTTONS = [
  { label: '花海咲季', roleId: '1433209432581341305', customId: 'role_hanamizaki' },
  { label: '月村手毬', roleId: '1433331636514062447', customId: 'role_tsukimura' },
  { label: '藤田ことね', roleId: '1433332410623328398', customId: 'role_fujita' },
  { label: '有村麻央', roleId: '1433332920667476068', customId: 'role_arimura' },
  { label: '葛城リーリヤ', roleId: '1433333171453169794', customId: 'role_katsuragi' },
  { label: '倉本千奈', roleId: '1433333415947669534', customId: 'role_kuramoto' },
  { label: '紫雲清夏', roleId: '1433333595694563429', customId: 'role_shiun' },
  { label: '篠澤広', roleId: '1433333784270606428', customId: 'role_shinozawa' },
  { label: '姫崎莉波', roleId: '1433333959378604104', customId: 'role_himezaki' },
  { label: '花海佑芽', roleId: '1433334170721189989', customId: 'role_hanamiyume' },
  { label: '秦谷美鈴', roleId: '1433334387252138015', customId: 'role_hataya' },
  { label: '十王星南', roleId: '1433334591179063316', customId: 'role_juuo' },
  { label: '雨夜燕', roleId: '1433334807441702952', customId: 'role_amayo' }
];

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) return console.error("❌ チャンネルが見つかりません。");

    // --- Embed1：サークル規約 ---
    const embed1 = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📖 サークル規約（概要）")
      .setDescription(
`📌 **ゲームプレイに関して**
学マスおよびコンテストを継続してプレイすることを原則とします。  
基準として、最終ログインが **3日以内** である状態を維持してください。  

やむを得ない事情で一時的にプレイを続けることが難しい場合は、  
事前にご連絡をいただければ問題ありません。  

🗣️ **サークル内での活動について**
• 他者を卑下・侮辱する行為、または社会通念上不適切とみなされる言動  
　（例：礼節を欠く発言など）を禁止します。  
　該当する行為が確認された場合には **警告** を行います。  
　改善が認められない場合には **除名処分** となることがあります。  

• コンテスト編成などの議論内容は、  
　**発案者の承諾なしに外部へ公開することを禁止** します。`
      );

    // --- Embed2：提携・目安箱・お問い合わせ ---
    const embed2 = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🤝 提携サークル（チケット教団）・📮 目安箱・📨 お問い合わせ")
      .setDescription(
`──────────────────────────────

🤝 **提携サークルについて**
当サークルでは、主に情報交換および交流促進を目的として、  
サークル「チケット教団」と提携し、共有サーバーを運営しています。  
同サークルとは過去にオフ会等で面識があり、  
当サークルと一定の交流関係を有する提携団体です。  

📎 **【合同サーバーURL】**  
➡️ [サーバーに参加する](https://discord.gg/BhA3PWd4)

本サーバーへの参加は任意としますが、以下の規則を遵守してください。  

• **発言には細心の注意を払ってください。**  
　不用意な発言により、サークル全体が不利益を被る可能性があります。  

• **該当サーバーに起因する情報の外部流出は厳禁** とします。  
　※ただし、公式サーバーで既に公開されている情報はこの限りではありません。  

• 当サーバーに関する疑問や不明点がある場合は、  
　**必ず運営陣に許可または確認を取るようにしてください。**  

💡 節度を保ち、双方のサークルが良好な関係を築けるようご協力をお願いします。  

──────────────────────────────

📮 **目安箱の設置**
メンバーと運営陣との円滑な意見交換を目的として、目安箱を設置しています。  

🔹 **主な用途**
・新規チャンネル設立願い  
・サークル運用に関する変更願い  
・運営陣の変更願い（連名による不信任決議等の提出）  
・メンバー間の仲裁願い　など  

投稿は匿名化フォーム（希望により名義記載も可）で送信され、  
投稿者が特定されることはありません。  

内容は運営陣で慎重に検討され、必要に応じて反映または【連絡】チャンネルで共有されます。  
（※すべての提案が必ず採用されるとは限りません。）  

📝 健全で中立的な運営のために、ぜひご活用ください。  

📎 **【目安箱URL】**  
➡️ [匿名フォームを開く](https://forms.gle/1MEz7F1wE1NSaWwL8)


💬 **お問い合わせ**
対話形式で相談したい場合は  
📎 [#お問い合わせ](https://discord.com/channels/1431896098036781171/1433797414598479922)  
よりチャンネルを開いてください。運営人と直接会話が可能になります。`
      );

    // --- Embed3：チャンネル案内（分割対応） ---
    const SEP = '▶︎┄┄┄┄┄┄┄┄┄┄┄◀︎';
    const embed3 = new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle("📚 サーバー各チャンネルの利用方法（案内）")
      .setDescription(
`
以下は各チャンネルの用途をまとめたものです。`
      )
      .addFields(
        {
          name: '\u200B',
          value:
`<#1431904100081205268>
> ルール等のまとめ  
<#1433797341642489936>
> 担当アイドルのロールを自分に追加  
${SEP}`
        },
        {
          name: '\u200B',
          value:
`<#1431896098674577459>
> 新しく入られた方の通知  
<#1431903913833009253>
> 自己紹介を投稿  
<#1431896098674577460>
> 運営からの連絡（**新メンバー加入アンケートは重要**）  
${SEP}`
        },
        {
          name: '\u200B',
          value:
`<#1431902505209696256>
> 学マスに関する雑談  
<#1431902551124742205>
> 評価値の攻略情報  
<#1431902589590704129>
> 編成／シナリオ攻略共有（**有用情報歓迎**）  
<#1431902622318596167>
> 各メンバーの通知表（約1か月ごと更新）  
${SEP}`
        },
        {
          name: '\u200B',
          value:
`<#1431902822953385984>
> コンテストに関する雑談  
<#1432388076256231516>
> スクショを貼るだけで必要スコアを可視化  
${SEP}`
        },
        {
          name: '\u200B',
          value:
`<#1431902969795706941>
> シミュレーション結果共有  
<#1431902996060700813>
> プロデュース編成の共有（育成時の参考）  
<#1431903020517425332>
> リハーサルの ave 共有（秘密事項）  
${SEP}`
        },
        {
          name: '\u200B',
          value:
`<#1431901093612486738>
> ボイスチャット（参加自由）  
<#1431901117205319742>
> BOT 設定変更用  
${SEP}`
        },
        {
          name: '\u200B',
          value:
`<#1431903789853708338>
> 雑談。常識の範囲で自由に  
<#1431903815946211338>
> 他ゲーム談義  
<#1431903867947319336>
> 食の話題  
<#1433797414598479922>
> Ticket 用チャンネル（対話形式の相談）  
${SEP}`
        },
        {
          name: '\u200B',
          value:
`<#1432335666959745044>
> 各人のメモ保管庫。個人チャンネル設立をご希望の方は <#1433797414598479922> よりご連絡ください。`
        }
      )
      .setFooter({ text: "迷ったら #連絡 / #お問い合わせ へ" })
      .setTimestamp();

    await channel.send({ embeds: [embed1, embed2, embed3] });
    console.log("✅ メッセージを送信しました！");
  } catch (err) {
    console.error("❌ 送信中エラー:", err);
  }
});

// === ボタン押下（ロール付与） ===
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const def = ROLE_BUTTONS.find(r => r.customId === interaction.customId);
  if (!def) return;

  const me = await interaction.guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: '⚠️ Botに「ロールの管理」権限がありません。', ephemeral: true });
  }

  const role = interaction.guild.roles.cache.get(def.roleId);
  if (!role) {
    return interaction.reply({ content: '⚠️ ロールが見つかりません。', ephemeral: true });
  }

  const member = interaction.member;
  const has = member.roles.cache.has(role.id);

  try {
    if (has) {
      await member.roles.remove(role);
      await interaction.reply({ content: `✅ 「${role.name}」を解除しました。`, ephemeral: true });
    } else {
      await member.roles.add(role);
      await interaction.reply({ content: `✅ 「${role.name}」を付与しました。`, ephemeral: true });
    }
  } catch (e) {
    console.error(e);
    await interaction.reply({ content: '❌ ロール操作に失敗しました。時間をおいて再度お試しください。', ephemeral: true });
  }
});

client.login(TOKEN).catch(err => {
  console.error("❌ ログイン失敗:", err);
});

