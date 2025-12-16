// --- tiny health server for Render (moved to src/core) ---
const { startHealthServer } = require('./src/core/healthServer');
const { installProcessGuards } = require('./src/core/processGuards');

installProcessGuards();
startHealthServer(process.env.PORT || 10000);
// --- end tiny health server ---


// ===== CircleBot (CommonJS) =====
console.log("Boot: starting bot.js v3");

// ① dotenv はここで1回だけ呼ぶ
require('dotenv').config();

// ② discord.js の import を「拡張」する
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

// ③ サーバー固有のIDは config から読む（移行・運用を簡単にするため）
const { loadServerConfig } = require('./src/config');
const cfg = loadServerConfig();




const {
  appendRecord,
  getRecordsByUser,
  getAllRecords,
  getUserSeasonHistory, // ← 追加
} = require('./data/motiSheetStore');

const {
  appendLinkContestRecord,
  getLinkContestRecordsByUser,
  getAllLinkContestRecords,
} = require('./data/motiLinkContestSheetStore');

const {
  appendMonthlyRecord,
  getAllMonthlyRecords,
  getMonthlyRecordsByUser,
} = require('./data/motiMonthSheetStore');

const { runMonthlyDmReminder } = require('./src/features/moti/monthlyDmReminder');


function parseSeasonNumber(season) {
  if (!season) return 0;
  const m = String(season).match(/\d+/);
  return m ? Number(m[0]) : 0;
}


const CURRENT_SEASON = process.env.MOTI_CURRENT_SEASON || 'S35';
const MOTI_NOTICE_CHANNEL_ID = cfg.channels?.motiNotice || null;
const MAIN_GUILD_ID = cfg.guildId;

// 月間モチベ自動DMの結果を投稿するチャンネル
const MOTI_DM_LOG_CHANNEL_ID = cfg.channels?.log || null;

// === VC監視（v15 events化） ===
const {
  registerVoiceStateUpdate,
  onReadyVcInit,
} = require('./src/events/voiceStateUpdate');

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = cfg.channels?.rulesSummary;

// ※ VC関連の env/ユーティリティは src/features/vc/vcMonitor に移動

// ===== 成績通知表: シーズン別サマリー共通処理 =====
async function buildSeasonSummaryForUser(userId, username, limitSeasons) {
  // 全シーズン分の記録を取得（getAllRecords が season 省略時に全件返す前提）
  const allRecords = await getAllRecords();

  if (!allRecords || !allRecords.length) {
    return null;
  }

  // season -> Map<userId, { timestamp, rank, grow, username }>
  const seasonUserMap = new Map();

  for (const r of allRecords) {
    const seasonKey = r.season || 'UNKNOWN';

    if (!seasonUserMap.has(seasonKey)) {
      seasonUserMap.set(seasonKey, new Map());
    }
    const userMap = seasonUserMap.get(seasonKey);

    const prev = userMap.get(r.userId);
    // 同じシーズン・同じユーザーでは「一番新しい記録」を採用
    if (!prev || r.timestamp > prev.timestamp) {
      userMap.set(r.userId, {
        timestamp: r.timestamp,
        rank: r.rank,
        grow: r.grow,
        username: r.username,
      });
    }
  }

  // シーズンを番号順にソート（"S35" などを想定）
  const sortSeasonKeys = (keys) => {
    return [...keys].sort((a, b) => {
      const na = parseInt(String(a).replace(/^\D+/, ''), 10);
      const nb = parseInt(String(b).replace(/^\D+/, ''), 10);

      if (Number.isNaN(na) || Number.isNaN(nb)) {
        return String(a).localeCompare(String(b));
      }
      return na - nb;
    });
  };

  const allSeasonKeysSorted = sortSeasonKeys(seasonUserMap.keys());

  // このユーザーが記録を持っているシーズンだけを抽出
  const userSeasonKeys = allSeasonKeysSorted.filter(
    (s) => seasonUserMap.get(s).has(userId),
  );

  if (!userSeasonKeys.length) {
    return null;
  }

  // 直近 limitSeasons 件だけ
  const targetSeasonKeys = limitSeasons
    ? userSeasonKeys.slice(-limitSeasons)
    : userSeasonKeys;

  // シーズンごとの「サークル平均 今季育成数」を計算
  const prevGrowByUser = new Map();
  const circleAvgGrowBySeason = new Map();

  for (const s of allSeasonKeysSorted) {
    const usersInSeason = seasonUserMap.get(s);
    const diffs = [];

    for (const [uId, rec] of usersInSeason.entries()) {
      const prevGrow = prevGrowByUser.get(uId);
      const growDiff =
        prevGrow == null ? rec.grow : rec.grow - prevGrow;

      diffs.push(growDiff);
      prevGrowByUser.set(uId, rec.grow);
    }

    const avgGrow =
      diffs.length > 0
        ? diffs.reduce((a, b) => a + b, 0) / diffs.length
        : 0;

    circleAvgGrowBySeason.set(s, avgGrow);
  }

  // 対象ユーザーのシーズンごとサマリーを作成
  const lines = [];
  let prevRankUser = null;
  let prevGrowUser = null;

  for (const s of targetSeasonKeys) {
    const rec = seasonUserMap.get(s).get(userId);
    if (!rec) continue;

    const lastRank = rec.rank;
    const lastGrow = rec.grow;

    const seasonGrow =
      prevGrowUser == null ? lastGrow : lastGrow - prevGrowUser;
    const seasonRankDiff =
      prevRankUser == null ? 0 : lastRank - prevRankUser;

    const avgGrow = circleAvgGrowBySeason.get(s) ?? 0;
    const diffFromAvg = seasonGrow - avgGrow;

    const mark =
      diffFromAvg > 0 ? '🟢' :
      diffFromAvg < 0 ? '🔻' :
      '➖';

    const rankDiffText =
      prevRankUser == null
        ? '（初期値）'
        : `（前シーズン比 ${seasonRankDiff >= 0 ? '+' : ''}${seasonRankDiff}）`;

    lines.push(
      `**${s}**\n` +
      `最終順位: ${lastRank}位 ${rankDiffText}\n` +
      `最終育成数: ${lastGrow}（今季 +${seasonGrow}）\n` +
      `　┗ 今季育成数: +${seasonGrow}（サークル平均 +${avgGrow.toFixed(1)}）${mark}`,
    );

    prevRankUser = lastRank;
    prevGrowUser = lastGrow;
  }

  if (!lines.length) {
    return null;
  }

  const title =
    limitSeasons && targetSeasonKeys.length > limitSeasons
      ? `📘 シーズン別まとめ（直近${limitSeasons}シーズン） - ${username}`
      : `📘 シーズン別まとめ - ${username}`;

  return {
    title,
    description:
      '各シーズンの最終順位と「今季育成数（前シーズン末からの増加）」を表示します。',
    lines,
  };
}


// ※ cleanupOldVcLogs は src/features/vc/vcMonitor に移動

if (!TOKEN || !CHANNEL_ID) {
  console.error("❌ DISCORD_TOKEN または送信先チャンネルID（CHANNEL_ID / config.channels.rulesSummary）がありません。");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,  // 👈 これを追加
  ],
});

// v15: VC監視は events/voiceStateUpdate へ分離
registerVoiceStateUpdate(client);

const { setupMotiMonthlyReminder } = require('./src/features/moti/scheduler');

const { handleRoleButtonInteraction } = require('./src/features/roles/roleButtonHandler');
// === ロールボタン設定（IDは config に集約）===
const IDOL_DEFS = cfg.roles?.idols;
if (!Array.isArray(IDOL_DEFS) || IDOL_DEFS.length === 0) {
  console.error('❌ server config に roles.idols がありません。');
  process.exit(1);
}

const ROLE_BUTTONS = IDOL_DEFS.map(({ label, roleId, customId }) => ({ label, roleId, customId }));

// === アイドルロール一覧（個別Embed表示用・絵文字なし）===
const IDOL_ROLES = IDOL_DEFS.map(({ label, roleId }) => ({ id: roleId, name: label }));

const IDOL_ROLE_ID_SET = new Set(IDOL_ROLES.map(r => r.id));

// v15 対応：'ready' → Events.ClientReady
client.once(Events.ClientReady, async (clientReady) => {
  console.log(`✅ Logged in as ${clientReady.user.tag}`);

  setupMotiMonthlyReminder(client);
  // v15: VCログ自動削除 + 起動時のVC元名確保（events側で集約）
  await onReadyVcInit(client);
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
    const inquiryUrl = `https://discord.com/channels/${cfg.guildId}/${cfg.channels.inquiry}`;
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
➡️ [サーバーに参加する](https://discord.gg/XWHyHxkJGn)

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
📎 [#お問い合わせ](${inquiryUrl})  
よりチャンネルを開いてください。運営人と直接会話が可能になります。`
      );

    // --- Embed3：チャンネル案内（分割対応） ---
    const SEP = '▶︎┄┄┄┄┄┄┄┄┄┄┄◀︎';
    const m = (id) => `<#${id}>`;
    const ch = cfg.channels || {};
    const g = (ch.guide || {});
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
`${m(ch.rulesSummary)}
> ルール等のまとめ  
${m(ch.rolepanel)}
> 担当アイドルのロールを自分に追加  
${SEP}`
        },
        {
          name: '\u200B',
          value:
`${m(g.newMemberNotify)}
> 新しく入られた方の通知  
${m(g.selfIntro)}
> 自己紹介を投稿  
${m(g.contact)}
> 運営からの連絡（**新メンバー加入アンケートは重要**）  
${SEP}`
        },
        {
          name: '\u200B',
          value:
`${m(g.gakumasChat)}
> 学マスに関する雑談  
${m(g.evaluationStrategy)}
> 評価値の攻略情報  
${m(g.formationShare)}
> 編成／シナリオ攻略共有（**有用情報歓迎**）  
${m(g.reportCard)}
> 各メンバーの通知表（約1か月ごと更新）  
${SEP}`
        },
        {
          name: '\u200B',
          value:
`${m(g.contestChat)}
> コンテストに関する雑談  
${m(g.scoreTool)}
> スクショを貼るだけで必要スコアを可視化  
${SEP}`
        },
        {
          name: '\u200B',
          value:
`${m(g.simulationShare)}
> シミュレーション結果共有  
${m(g.produceFormationShare)}
> プロデュース編成の共有（育成時の参考）  
${m(g.rehearsalAveShare)}
> リハーサルの ave 共有（秘密事項）  
${SEP}`
        },
        {
          name: '\u200B',
          value:
`${m(g.voiceChat)}
> ボイスチャット（参加自由）  
${m(g.botSettings)}
> BOT 設定変更用  
${SEP}`
        },
        {
          name: '\u200B',
          value:
`${m(g.freeTalk)}
> 雑談。常識の範囲で自由に  
${m(g.otherGames)}
> 他ゲーム談義  
${m(g.foodTalk)}
> 食の話題  
${m(ch.inquiry)}
> Ticket 用チャンネル（対話形式の相談）  
${SEP}`
        },
        {
          name: '\u200B',
          value:
`${m(g.memoArchive)}
> 各人のメモ保管庫。個人チャンネル設立をご希望の方は ${m(ch.inquiry)} よりご連絡ください。`
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


// ※ VC入室／退出監視は src/features/vc/vcMonitor に移動


// ※ VC入室／退出監視は src/features/vc/vcMonitor に移動

// v15: InteractionCreate を src/events に集約（入口1本化）
const { registerInteractionCreate } = require('./src/events/interactionCreate');
registerInteractionCreate(client, {
  ROLE_BUTTONS,
  IDOL_ROLES,
  CURRENT_SEASON,
  MOTI_NOTICE_CHANNEL_ID,
  appendRecord,
  getRecordsByUser,
  getAllRecords,
  appendLinkContestRecord,
  getLinkContestRecordsByUser,
  getAllLinkContestRecords,
  appendMonthlyRecord,
  getAllMonthlyRecords,
  getMonthlyRecordsByUser,
  runMonthlyDmReminder,
  buildSeasonSummaryForUser,
});



// ===== Botログイン =====
client.login(TOKEN).catch(err => {
  console.error("❌ ログイン失敗:", err);
});