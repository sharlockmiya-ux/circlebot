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

// === ロールボタン定義（rolepanel.js と同じ customId を使用）===
const ROLE_BUTTONS = [
  { label: '花海咲季', roleId: '1433172645775409313', customId: 'role_hanamizaki' },
  { label: '月村手毬', roleId: '1433203573339979909', customId: 'role_tsukimura' },
  { label: '藤田ことね', roleId: '1433205808136589372', customId: 'role_fujita' },
  { label: '有村麻央', roleId: '1433206251923177513', customId: 'role_arimura' },
  { label: '葛城リーリヤ', roleId: '1433206385985847407', customId: 'role_katsuragi' },
  { label: '倉本千奈', roleId: '1433206519217918002', customId: 'role_kuramoto' },
  { label: '紫雲清夏', roleId: '1433206612281266316', customId: 'role_shiun' },
  { label: '篠澤広', roleId: '1433206721760854147', customId: 'role_shinozawa' },
  { label: '姫崎莉波', roleId: '1433206833891508284', customId: 'role_himezaki' },
  { label: '花海佑芽', roleId: '1433206978066382939', customId: 'role_hanamiyume' },
  { label: '秦谷美鈴', roleId: '1433207092449382523', customId: 'role_hataya' },
  { label: '十王星南', roleId: '1433207186749652992', customId: 'role_juuo' },
  { label: '雨夜燕', roleId: '1433207380010733769', customId: 'role_amayo' }
];

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) {
      console.error("❌ チャンネルが見つかりません。CHANNEL_IDを確認してください。");
      return;
    }
    console.log("✅ Channel fetched:", CHANNEL_ID);

    const embed1 = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📖 サークル規約（概要）")
      .setDescription(
`──────────────────────────────

📌 **ゲームプレイに関して**
学マスおよびコンテストを継続してプレイすることを原則とします。  
基準として、最終ログインが **3日以内** である状態を維持してください。  

やむを得ない事情で一時的にプレイを続けることが難しい場合は、  
事前にご連絡をいただければ問題ありません。  

──────────────────────────────

🗣️ **サークル内での活動について**
• 他者を卑下・侮辱する行為、または社会通念上不適切とみなされる言動を禁止します。  
　改善が認められない場合には **除名処分** となることがあります。  
• コンテスト編成などの議論内容は、  
　**発案者の承諾なしに外部へ公開することを禁止** します。`
      );

    const embed2 = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🤝 提携サークルについて（チケット教団）・📮 目安箱")
      .setDescription(
`──────────────────────────────

🤝 **提携サークルについて（チケット教団）**
当サークルでは、主に情報交換および交流促進を目的として提携しています。  

📎 [合同サーバーURL](https://discord.gg/BhA3PWd4)

📮 **目安箱の設置**
メンバーと運営陣との意見交換を目的として、匿名フォームを設置しています。  
📎 [匿名フォームを開く](https://forms.gle/1MEz7F1wE1NSaWwL8)`
      );

    await channel.send({ embeds: [embed1, embed2] });
    console.log("✅ メッセージを送信しました！");
  } catch (err) {
    console.error("❌ 送信中エラー:", err);
  }
});

// === ボタン押下：ロール付与/解除 ===
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

  if (role.position >= me.roles.highest.position) {
    console.error('⚠️ 並び順エラー：Botロールが付与対象より下');
    return interaction.reply({ content: '⚠️ ただいま設定を更新中です。少し待ってから再度お試しください。', ephemeral: true });
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

