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

// IPv6優先などでGateway接続が不安定になる環境向け：IPv4優先
const dns = require('dns');
try {
  dns.setDefaultResultOrder('ipv4first');
  console.log('✅ dns: ipv4first');
} catch (e) {
  console.warn('dns.setDefaultResultOrder failed:', e?.message || e);
}

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

console.log(
  `[boot] node=${process.version} ` +
  `tokenLen=${TOKEN ? TOKEN.length : 0} ` +
  `tokenHasWhitespace=${TOKEN ? /\s/.test(TOKEN) : false} ` +
  `channelId=${CHANNEL_ID || 'null'} ` +
  `profile=${process.env.SERVER_CONFIG_NAME || process.env.SERVER_PROFILE || 'main'} ` +
  `netDebug=${((process.env.NET_DEBUG || '').trim() || 'unset')}`
);

// --- optional network debug (NET_DEBUG=1 のときだけ実行) ---
// ※ Discord側の429確認用。普段は NET_DEBUG を未設定のまま運用してください。
const https = require('https');

function ping(url, opts = {}) {
  return new Promise((resolve) => {
    const req = https.request(url, opts, (res) => {
      const ra = res.headers['retry-after'];
      const xra = res.headers['x-ratelimit-reset-after'];
      const global = res.headers['x-ratelimit-global'];

      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        let retryAfterSec = null;
        try {
          const j = JSON.parse(body || '{}');
          if (typeof j.retry_after === 'number') retryAfterSec = j.retry_after;
        } catch (_) {}

        console.log(
          `[net] ${url} -> ${res.statusCode}` +
          (ra ? ` retry-after=${ra}` : '') +
          (xra ? ` x-reset-after=${xra}` : '') +
          (global ? ` global=${global}` : '') +
          (retryAfterSec != null ? ` body.retry_after=${retryAfterSec}` : '')
        );
        resolve();
      });
      res.resume();
    });

    req.on('error', (e) => {
      console.error(`[net] ${url} error:`, e?.message || e);
      resolve();
    });

    req.setTimeout(10000, () => {
      console.error(`[net] ${url} timeout`);
      req.destroy();
      resolve();
    });

    req.end();
  });
}

if ((process.env.NET_DEBUG || '').trim() === '1') {
  // discord.js がログイン時に参照するのは gateway/bot なので、ここだけ確認します（余計なリクエストを増やさない）
  if (TOKEN) {
    ping('https://discord.com/api/v10/gateway/bot', {
      headers: { Authorization: `Bot ${TOKEN}` },
    });
  } else {
    console.log('[net] NET_DEBUG=1 but TOKEN is empty');
  }
}
// --- end optional network debug ---

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


// ===== 成績通知表: リンクコンテスト シーズン別サマリー共通処理 =====
async function buildLinkContestSeasonSummaryForUser(userId, username, limitSeasons) {
  let allRecords = [];
  try {
    // getAllLinkContestRecords が season 省略時に全件返す前提
    allRecords = await getAllLinkContestRecords();
  } catch (e) {
    console.error('buildLinkContestSeasonSummaryForUser error:', e);
    return null;
  }

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

  return {
    title: `📘 リンクコンテスト シーズン別まとめ - ${username}`,
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

// --- diagnostics (運用ログ) ---
client.rest.on('rateLimited', (info) => {
  console.warn('⏳ [rest rateLimited]', {
    route: info.route,
    method: info.method,
    global: info.global,
    timeToReset: info.timeToReset,
    limit: info.limit,
  });
});

client.on('error', (e) => console.error('client error:', e));
client.on('warn', (m) => console.warn('client warn:', m));
client.on('shardError', (e) => console.error('shardError:', e));
client.on('shardDisconnect', (event) => console.warn('shardDisconnect:', event?.code, event?.reason));
client.on('shardReconnecting', () => console.warn('shardReconnecting'));
// --- end diagnostics ---

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
    // --- サーバー運用ガイド（埋め込み差し替え） ---
    const mainEmbeds = [
    new EmbedBuilder()
      .setColor(0x3D5AFE)
      .setDescription(`## **サーバー運用へようこそ！**

このページでは、各チャンネルの目的やサーバーを最大限に活用するために、

- サークル運営について
- メンバーが遵守すべき規約
- サークル提携について
- 各チャンネルの説明

を主に取り扱っています。**必ずご一読ください**

ガイドを通じて放課後アイドル部についての理解を深めていきましょう！`)
      .setTimestamp(),

    new EmbedBuilder()
      .setColor(0x00BFA5)
      .setDescription(`## **:books:サークル運営について**

当サークルでは、管理者3名（＋エンジニア陣）が方針を決定し企画や人事を行っております。
【サークルに笑顔を。アイマスに情熱を。】をサークル方針とし、安定的かつ強固、革新的な活動を推進しております。`)

      .addFields({ name: "サークル情報", value: `- 2024/5/31設立
- サークルリーダー: <@261492159557926912> 
- メンバー : 25/30人
- 覇者 : 12人
- 第一回サークルイベント: 8位

10年後も変わらずに活動が達成されるサークル作りのために、創造的精神を発揮してまいります。` }),

    new EmbedBuilder()
      .setColor(0x00C853)
      .setDescription(`## **:desktop:ゲームプレイに関して**

学マスを継続してプレイすることを原則とします。基準として、最終ログインが **3日以内** である状態を維持してください。

やむを得ない事情で一時的にプレイを続けることが難しい場合は、 https://discord.com/channels/1431896098036781171/1433797414598479922 かサークルリーダーにご連絡ください。

また、当サークルでは月間ごとに通知表（育成数・増加ファン数）の提出を**義務化**しています。
- \`/input_month\` で月次のデータを入力
- \`/month_me\`で振り返りができます。
> 詳細は下部のコマンド紹介をご参照ください。`),

    new EmbedBuilder()
      .setColor("#FF0000")
      .setDescription(`## **:no_entry_sign:サークル規約について**

- 他者を卑下・侮辱する行為、または社会通念上不適切とみなされる言動（例：礼節を欠く発言など）を禁止します。
> 該当する行為が確認された場合には 警告 を行います。
> 改善が認められない場合には　**不名誉除名**　となることがあります。

- コンテスト編成に代表される一切のサーバー情報の外部公開は　**基本禁止**　します。`),

    new EmbedBuilder()
      .setColor(0xFFB300)
      .setDescription(`## **:handshake:提携サークルについて**

当サークルでは、主に情報交換および交流促進を目的として、サークル『チケット教団』と提携し、共有サーバーを運営しています。
同サークルとは過去にオフ会等で面識があり、当サークルと一定の交流関係を有する提携団体です。

:paperclip:【**合同サーバーURL**】
:arrow_right:[サーバーに参加する](https://discord.gg/XWHyHxkJGn)

本サーバーへの参加は任意としますが、以下の規則を遵守してください。`)
      .addFields(
        { name: "• 発言には細心の注意を払ってください。", value: `不用意な発言により、サークル全体が不利益を被る可能性があります。`, inline: true },
        { name: "• 該当サーバーに起因する情報の外部流出は**厳禁**とします。", value: `※ただし、公式サーバーで既に公開されている情報はこの限りではありません。`, inline: true },
        { name: "• 当サーバーに関する疑問や不明点がある場合は、必ず運営陣に許可または確認を取るようにしてください。", value: `節度を保ち、双方のサークルが良好な関係を築けるようご協力をお願いします。`, inline: true }
      ),
new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setDescription(`## **:keyboard: コマンド**

## 月間入力
\`/input_month\`
> 月間レポートを記録します
\`/month_me\`
> 自分の月間推移を確認します
【管理者】\`/month_report\`
> 指定した月の月間レポートを表示します
【自動化済】\`/month_remind\`
> 指定月の月間レポート未入力者にDMを送信します

## コンテスト成績入力
\`/input_contest\`
> コンテストの現在の順位・育成数を記録します
\`/input_link\`
> リンクコンテストの順位・育成数を記録します
\`/contest_me\`
> コンテストの自分の順位・育成数の推移を確認します
\`/contest_me_link\`
> リンクコンテストの自分の順位・育成数の推移を確認します
\`/summary_me\`
> コンテストの直近のシーズン別サマリーを表示します
\`/summary_me_all\`
> コンテストの全シーズンのシーズン別サマリーを表示します
\`/summary_link_me\`
> リンクコンテストの直近のシーズン別サマリーを表示します
\`/summary_link_me_all\`
> リンクコンテストの全シーズンのシーズン別サマリーを表示します
【管理者】\`/season_close\`
> シーズン終了通知をチャンネルへ投稿します
【管理者】\`/season_close_link\`
> リンクコンテストのシーズン終了通知をチャンネルへ投稿します


## レポート・出力
【管理者】\`/contest_report\`
> 指定シーズンの成績推移レポートを表示します
【管理者】\`/contest_link_report\`
> 指定シーズンのリンクコンテスト成績推移レポートを表示します
【管理者】\`/export_notion\`
> Notion用のサマリー表を出力します
【管理者】\`/notion_link_notion\`
> リンクコンテストのNotion用サマリー表を出力します

## ヘルプ
\`/help_general\`
> 成績通知表システムの使い方を表示します`),

    new EmbedBuilder()
      .setColor(0xAB47BC)
      .setDescription(`## **:envelope_with_arrow:お問い合わせ**

我々は、効率的な運営にはメンバーからのフィードバックが不可欠と考えており、そのために目安箱の設置等を実施しております。`)

      .addFields({ name: ":small_blue_diamond: 主な用途", value: `- 新規チャンネル設立願い
- サークル運用に関する変更願い
- 運営陣の変更願い（連名による不信任決議等の提出）
- メンバー間の仲裁願い　など

投稿は匿名化フォームで送信され、投稿者が特定されることはありません。

内容は運営陣で慎重に検討され、必要に応じて反映または【連絡】チャンネルで共有されます。
> ※すべての提案が採用されるとは限りません

**健全で中立的な運営のために、ぜひご活用ください！**

:paperclip:﻿【**目安箱URL**】
:arrow_right:[匿名フォームを開く](https://forms.gle/1MEz7F1wE1NSaWwL8)
:speech_balloon:お問い合わせ
対話形式で相談したい場合は[#お問い合わせ](https://discord.com/channels/1431896098036781171/1433797414598479922)
よりチャンネルを開いてください。運営と直接会話が可能になります。` }),
    ];

    // 送信順の都合で、運用ガイドは前半/後半に分割（提携サークル → チャンネル案内 → コマンド の順）
    const opsEmbedsPart1 = mainEmbeds.slice(0, 5); // イントロ〜提携サークル
    const opsEmbedsPart2 = mainEmbeds.slice(5);    // コマンド〜お問い合わせ


    // --- サーバー各チャンネルの利用案内（カテゴリ別） ---
    const channelGuideEmbeds = [
      new EmbedBuilder()
        .setColor(0x3D5AFE)
        .setDescription(`## **サーバー各チャンネルの利用案内**

## **:placard:ガイドライン**
https://discord.com/channels/1431896098036781171/1431904100081205268 : **必読**　ルール
https://discord.com/channels/1431896098036781171/1433797341642489936 : ロール紹介・ロール付与`),

      new EmbedBuilder()
        .setColor(0x00BFA5)
        .setDescription(`## **:envelope_with_arrow:インフォメーション**
https://discord.com/channels/1431896098036781171/1431896098674577459 : 新しく入られた方の通知
https://discord.com/channels/1431896098036781171/1431903913833009253 : 自己紹介を投稿
https://discord.com/channels/1431896098036781171/1431896098674577460 : 運営からの連絡（**必読**）`),

      new EmbedBuilder()
        .setColor(0x29B6F6)
        .setDescription(`## **:file_folder:学マス全般**
https://discord.com/channels/1431896098036781171/1431902505209696256 : 学マスに関する雑談
https://discord.com/channels/1431896098036781171/1431902551124742205 : 評価値の攻略情報
https://discord.com/channels/1431896098036781171/1431902589590704129 : 編成 / シナリオ / ツール共有
https://discord.com/channels/1431896098036781171/1431902622318596167 : 各メンバーの通知表（コマンドを用いての提出必須）`),

      new EmbedBuilder()
        .setColor(0xFFB300)
        .setDescription(`## **:round_pushpin:コンテスト全般**
https://discord.com/channels/1431896098036781171/1431902822953385984 : コンテストに関する雑談
https://discord.com/channels/1431896098036781171/1439983535288225903 :リンクコンテストに関する雑談
https://discord.com/channels/1431896098036781171/1449751590096601160 :各キャラ事の育成の仕方
https://discord.com/channels/1431896098036781171/1432388076256231516 : 必要スコアを可視化`),

      new EmbedBuilder()
        .setColor(0xAB47BC)
        .setDescription(`## **:globe_with_meridians:ステージ**
https://discord.com/channels/1431896098036781171/1431902969795706941 : シミュレーション結果共有
https://discord.com/channels/1431896098036781171/1431903020517425332 :実機のave共有
https://discord.com/channels/1431896098036781171/1439982253076643981 :リンクコンテストの攻略`),

      new EmbedBuilder()
        .setColor(0x00C853)
        .setDescription(`## **:microphone:VC**
https://discord.com/channels/1431896098036781171/1431901093612486738 : ボイスチャット（参加歓迎）
https://discord.com/channels/1431896098036781171/1431901117205319742 : BOT 設定変更用`),

      new EmbedBuilder()
        .setColor(0x78909C)
        .setDescription(`## **:label:その他**
https://discord.com/channels/1431896098036781171/1431903789853708338 : 雑談全般
https://discord.com/channels/1431896098036781171/1431903815946211338 : 他ゲーム談義
https://discord.com/channels/1431896098036781171/1431903867947319336 : ｳﾏｶｰ
https://discord.com/channels/1431896098036781171/1433797414598479922 : Ticket 用チャンネル。運営への連絡・報告等はこちらへ`),

      new EmbedBuilder()
        .setColor("#ff9500")
        .setDescription(`## **:speech_balloon:フォーラム**
https://discord.com/channels/1431896098036781171/1449752576160694372 : 各人のメモ保管庫。`),
    ];


const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel("目安箱")
    .setURL("https://forms.gle/1MEz7F1wE1NSaWwL8"),
  new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel("お問い合わせ")
    .setURL("https://discord.com/channels/1431896098036781171/1433797414598479922")
);

const BOT_ID = clientReady.user.id;

// メッセージ特定用（誤って別メッセージを上書きしないため）
const OPS1_MARKER_1 = "サーバー運用へようこそ！";
const OPS1_MARKER_2 = "必ずご一読ください";

const GUIDE_MARKER_1 = "サーバー各チャンネルの利用案内";
const GUIDE_MARKER_2 = ":placard:ガイドライン";

const OPS2_MARKER_1 = ":keyboard: コマンド";
const OPS2_MARKER_2 = ":envelope_with_arrow:お問い合わせ";

const messageHas = (m, marker) => {
  if (!Array.isArray(m.embeds)) return false;
  return m.embeds.some((e) => String(e?.description || "").includes(marker));
};

const isOpsPart1Message = (m) =>
  messageHas(m, OPS1_MARKER_1) && messageHas(m, OPS1_MARKER_2);

const isGuideMessage = (m) =>
  messageHas(m, GUIDE_MARKER_1) && messageHas(m, GUIDE_MARKER_2);

const isOpsPart2Message = (m) =>
  messageHas(m, OPS2_MARKER_1) && messageHas(m, OPS2_MARKER_2);

async function upsertMessage(label, predicate, payload) {
  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const candidates = recent
    ? [...recent.values()].filter((m) => m.author?.id === BOT_ID && predicate(m))
    : [];
  const target = candidates.sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0];

  if (target) {
    await target.edit(payload);
    console.log(`✅ ${label} を更新しました！ (${target.id})`);
    return;
  }

  const sent = await channel.send(payload);
  console.log(`✅ ${label} を送信しました！ (${sent.id})`);
}

// --- ① 運用ガイド（前半：イントロ〜提携サークル） ---
await upsertMessage("運用ガイド（前半）", isOpsPart1Message, {
  content: "",
  embeds: opsEmbedsPart1,
  components: [],
});

// --- ② サーバー各チャンネルの利用案内（カテゴリ別） ---
await upsertMessage("チャンネル案内", isGuideMessage, {
  content: "",
  embeds: channelGuideEmbeds,
  components: [],
});

// --- ③ 運用ガイド（後半：コマンド〜お問い合わせ） ---
await upsertMessage("運用ガイド（後半）", isOpsPart2Message, {
  content: "",
  embeds: opsEmbedsPart2,
  components: [row],
});



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
  buildLinkContestSeasonSummaryForUser,
});



// ===== Botログイン =====
console.log('➡️ [login] calling client.login()...');

// ログインが“ずっとpending”になった場合に状況が見えるようにする（落とさない）
const __loginStartedAt = Date.now();
const __loginWatchdog = setInterval(() => {
  const elapsed = Math.floor((Date.now() - __loginStartedAt) / 1000);
  if (client.isReady()) {
    console.log(`✅ [login] client is ready (elapsed=${elapsed}s)`);
    clearInterval(__loginWatchdog);
    return;
  }
  const wsStatus = client.ws?.status ?? 'unknown';
  const shardCount = client.ws?.shards?.size ?? 'n/a';
  console.warn(`… [login] still pending (elapsed=${elapsed}s) wsStatus=${wsStatus} shards=${shardCount}`);
}, 15000);

client.login(TOKEN)
  .then(() => console.log('✅ [login] client.login() resolved'))
  .catch((err) => console.error('❌ [login] client.login() rejected:', err));
