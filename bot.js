// --- tiny health server for Render ---
const http = require('http');
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => { res.writeHead(200,{'Content-Type':'text/plain'}); res.end('OK'); }).listen(PORT, () => console.log(`✅ Health server on ${PORT}`));
// --- end tiny health server ---

// ===== CircleBot (CommonJS) =====
// ログを細かく出すので、どこで止まっているか分かります。
console.log("Boot: starting bot.js");

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
console.log("Boot: discord.js loaded");

require('dotenv').config();
console.log("Boot: dotenv loaded");

// .env から読み込み
const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN が .env にありません。");
  process.exit(1);
}
if (!CHANNEL_ID) {
  console.error("❌ CHANNEL_ID が .env にありません。");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
console.log("Boot: client created");

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
• 他者を卑下・侮辱する行為、または社会通念上不適切とみなされる言動  
　（例：礼節を欠く発言など）を禁止します。  
　該当する行為が確認された場合には **警告** を行います。  
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
➡️ [匿名フォームを開く](https://forms.gle/1MEz7F1wE1NSaWwL8)`
      );

    await channel.send({ embeds: [embed1, embed2] });
    console.log("✅ メッセージを送信しました！");
  } catch (err) {
    console.error("❌ 送信中エラー:", err);
  }
});

client.login(TOKEN).catch(err => {
  console.error("❌ ログイン失敗:", err);
});
