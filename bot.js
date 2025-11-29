// --- tiny health server for Render ---
const http = require('http');
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(PORT, () => console.log(`✅ Health server on ${PORT}`));
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

// ③ 追加ライブラリ
const cron = require('node-cron');

const {
  appendRecord,
  getRecordsByUser,
  getAllRecords,
  getUserSeasonHistory, // ← 追加
} = require('./data/motiSheetStore');

function parseSeasonNumber(season) {
  if (!season) return 0;
  const m = String(season).match(/\d+/);
  return m ? Number(m[0]) : 0;
}


const CURRENT_SEASON = process.env.MOTI_CURRENT_SEASON || 'S35';
const MOTI_NOTICE_CHANNEL_ID = process.env.MOTI_NOTICE_CHANNEL_ID;

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
} = require('@discordjs/voice');

// ===== 環境変数 & パス設定 =====
require('dotenv').config();
const path = require('path');

// 音声ファイル（VC開始時のonline音）
const VC_ONLINE_SOUND_PATH = path.join(__dirname, 'sounds', 'online.mp3');

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// ==== VC監視設定 ====
const VC_LOG_CHANNEL_ID = process.env.VC_LOG_CHANNEL_ID || null;
const VC_TARGET_CHANNELS = (process.env.VC_TARGET_CHANNELS || '')
  .split(',')
  .map(id => id.trim())
  .filter(id => id.length > 0);

const VC_PLAY_ONLINE_SOUND = (process.env.VC_PLAY_ONLINE_SOUND === 'true');

// VCごとの「元のチャンネル名」を覚えておく（0人になったら戻す用）
const originalVcNames = new Map();

// === VCログ自動削除（3日経ったログを消す） ===
const VC_LOG_MESSAGE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3日

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


async function cleanupOldVcLogs(client) {
  if (!VC_LOG_CHANNEL_ID) return;

  try {
    const channel = await client.channels.fetch(VC_LOG_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    const now = Date.now();
    let fetched;

    do {
      // 直近100件を取得
      fetched = await channel.messages.fetch({ limit: 100 });

      const targets = fetched.filter((m) => {
        // Bot自身のメッセージのみ
        if (m.author.id !== client.user.id) return false;
        // 3日より新しいものは残す
        if (m.createdTimestamp > now - VC_LOG_MESSAGE_MAX_AGE_MS) return false;
        // Embedが無いものはスキップ
        if (!m.embeds || m.embeds.length === 0) return false;

        const title = m.embeds[0].title ?? '';

        // VCログ用のタイトルだけを対象にする
        return (
          title.startsWith('🎧 VC開始') ||
          title.startsWith('🔴 VC終了') ||
          title.startsWith('🟢 VC入室') ||
          title.startsWith('🟡 VC退出')
        );
      });

      if (targets.size === 0) break;

      await channel.bulkDelete(targets, true);
      console.log(`🧹 VCログ自動削除: ${targets.size}件削除しました`);

      // 100件以上古いメッセージがある場合は、もう一度ループ
    } while (fetched.size === 100);
  } catch (err) {
    console.error('VCログ自動削除エラー:', err);
  }
}

if (!TOKEN || !CHANNEL_ID) {
  console.error("❌ .env に DISCORD_TOKEN または CHANNEL_ID がありません。");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,  // 👈 これを追加
  ],
});

function scheduleMotiReminder(client) {
  // 毎月1日 10:00 に実行（必要ならここはお好みで変更OK）
  cron.schedule(
    '0 10 1 * *',
    async () => {
      try {
        const channel = await client.channels.fetch(MOTI_NOTICE_CHANNEL_ID);
        if (!channel || !channel.isTextBased()) {
          console.error('moti reminder: 通知表チャンネルを取得できませんでした');
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('🗓️ 月初のお知らせ｜成績通知表の入力')
          .setColor(0xef4444) // 明るい赤
          .setDescription(
            [
              '┃今月も、サークル全体の「成長ログ」を残すために、成績通知表の入力をお願いします。',
              '┃まずは `/moti_input` で、今の状態を 1 回分だけ記録してください。'
            ].join('\n')
          )
          .addFields(
            {
              name: '1️⃣ 入力する内容',
              value: [
                '∥ 対象シーズン（例: `S35`、空欄なら現在シーズン）',
                '∥ 現在の順位（数字のみ）',
                '∥ 現在の育成数（その時点での累計回数）',
              ].join('\n'),
            },
            {
              name: '2️⃣ / 3️⃣ 使用するコマンド',
              value: [
                '**入力用**',
                '∥ `/moti_input` … 入力フォームを開く',
                '',
                '**振り返り用**',
                '∥ `/moti_me` … 直近10件の推移',
                '∥ `/moti_me_season` … 直近5シーズンまとめ',
                '∥ `/moti_me_all` … 全期間サマリー',
              ].join('\n'),
            },
          )
          .setFooter({ text: 'このお知らせは 3 日後に自動で削除されます。' });

        const msg = await channel.send({
          content: '@everyone',
          embeds: [embed],
          allowedMentions: {
            parse: ['everyone'], // @everyone をちゃんと有効にする
          },
        });

        // 3日後に自動削除
        setTimeout(() => {
          msg.delete().catch(() => {});
        }, 3 * 24 * 60 * 60 * 1000);
      } catch (err) {
        console.error('moti reminder error:', err);
      }
    },
    {
      timezone: 'Asia/Tokyo',
    },
  );
}


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

// === アイドルロール一覧（個別Embed表示用・絵文字なし） ===
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
  { id: '1433334807441702952', name: '雨夜燕' }
];

const IDOL_ROLE_ID_SET = new Set(IDOL_ROLES.map(r => r.id));

// v15 対応：'ready' → Events.ClientReady
client.once(Events.ClientReady, async (clientReady) => {
  console.log(`✅ Logged in as ${clientReady.user.tag}`);

  setupMotiMonthlyReminder(client);

  // === VCログ自動削除 ===
  setInterval(() => cleanupOldVcLogs(client), 3 * 60 * 60 * 1000);
  cleanupOldVcLogs(client);
  
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

// === ボタン押下：ロール付与/解除（トグル＋ON/OFFボタン＋アイドル個別Embed）===
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  try {
    let roleId = null;
    let mode = 'toggle'; // 'toggle' | 'on' | 'off'

    // デバッグ用：どのボタンが押されたかログに出す
    console.log('Button pressed:', interaction.customId);

    // --- パターン1: 赤/緑スイッチ用（role_on:<id> / role_off:<id>） ---
    const mForce = interaction.customId.match(/^role_(on|off):(\d{17,20})$/);
    if (mForce) {
      mode = mForce[1] === 'on' ? 'on' : 'off';
      roleId = mForce[2];
    }

    // --- パターン2: 新形式トグルボタン（role:<id>） ---
    if (!roleId) {
      const m = interaction.customId.match(/^role:(\d{17,20})$/);
      if (m) roleId = m[1];
    }

    // --- パターン3: 旧来のカスタムID（ROLE_BUTTONS 定義を使用） ---
    if (!roleId && typeof ROLE_BUTTONS !== 'undefined') {
      const def = ROLE_BUTTONS.find(r => r.customId === interaction.customId);
      if (def) roleId = def.roleId;
    }

    // 対応していないボタン
    if (!roleId) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: '⚠️ このボタンは現在使用できません。最新のパネルでお試しください。',
      });
      return;
    }

    // ロール取得
    let role = interaction.guild.roles.cache.get(roleId);
    if (!role) {
      try { role = await interaction.guild.roles.fetch(roleId); } catch {}
    }
    if (!role) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: '⚠️ ロールが見つかりません。運営に連絡してください。',
      });
      return;
    }

    // 権限 & 並び順チェック
    const me = await interaction.guild.members.fetchMe();
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: '⚠️ Botに「ロールの管理」権限がありません。',
      });
      return;
    }
    if (role.position >= me.roles.highest.position) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: '⚠️ ただいまロール設定を更新中です。少し待ってから再度お試しください。',
      });
      return;
    }

    // 対象メンバー & 保持状況
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const has = member.roles.cache.has(role.id);
    const isIdolRole = IDOL_ROLE_ID_SET.has(role.id);

    let replyText = '';

    // ===== モード別の挙動 =====
    if (mode === 'on') {
      if (has) {
        replyText = `✅ すでに「${role.name}」ロールを持っています。`;
      } else {
        await member.roles.add(role);
        replyText = `🟢 「${role.name}」ロールを付与しました。`;
      }
    } else if (mode === 'off') {
      if (!has) {
        replyText = `ℹ️ もともと「${role.name}」ロールは付与されていません。`;
      } else {
        await member.roles.remove(role);
        replyText = `🔴 「${role.name}」ロールを解除しました。`;
      }
    } else {
      if (has) {
        await member.roles.remove(role);
        replyText = `❎ 「${role.name}」ロールを解除しました。`;
      } else {
        await member.roles.add(role);
        replyText = `✅ 「${role.name}」ロールを付与しました。`;
      }
    }

    // ===== アイドルロールの場合は「担当一覧Embed」を付ける =====
    if (isIdolRole) {
      const updatedMember = await interaction.guild.members.fetch(interaction.user.id);

      const lines = IDOL_ROLES.map((idol) => {
        const hasIdol = updatedMember.roles.cache.has(idol.id);
        const status = hasIdol ? '🟢' : '🔘';
        return `${status} ${idol.name}`;
      });

      const embed = new EmbedBuilder()
        .setColor(0xff9edb)
        .setTitle('🎀 あなたの担当アイドル（現在）')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'ボタンを押すたびに、この一覧も更新されます。' });

      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: replyText,
        embeds: [embed],
      });
    } else {
      // お知らせロールなど通常ロールはテキストのみ
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: replyText,
      });
    }

  } catch (e) {
    console.error('interaction error:', e);
    try {
      if (!interaction.replied) {
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: '❌ エラーが発生しました。時間をおいて再度お試しください。',
        });
      }
    } catch {}
  }
});

// === VC入室／退出監視（複数VC対応 + Embedログ + REC表示 + オプション音声） ===
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  // 設定がなければ何もしない
  if (!VC_TARGET_CHANNELS.length || !VC_LOG_CHANNEL_ID) return;

  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  const beforeId = oldState.channelId;
  const afterId  = newState.channelId;

  const isTargetBefore = VC_TARGET_CHANNELS.includes(beforeId);
  const isTargetAfter  = VC_TARGET_CHANNELS.includes(afterId);

  // 監視対象VCに関係ない動きはスキップ
  if (!isTargetBefore && !isTargetAfter) return;

  const logChannel = guild.channels.cache.get(VC_LOG_CHANNEL_ID);
  const user       = newState.member || oldState.member;

  // Bot自身はスキップ
  if (user && user.user.bot) return;

  // 監視対象VCごとに処理
  for (const vcId of VC_TARGET_CHANNELS) {
    const vc = guild.channels.cache.get(vcId);
    if (!vc || vc.type !== 2) continue; // 2 = ボイスチャンネル

    // 元の名前を保存
    if (!originalVcNames.has(vc.id)) {
      originalVcNames.set(vc.id, vc.name);
    }

    const humanCount = vc.members.filter(m => !m.user.bot).size;
    const baseName   = originalVcNames.get(vc.id) || vc.name;

    // === 1) このVCに「入った」ケース ===
    if (afterId === vcId && beforeId !== vcId) {

      // 0→1人になった瞬間 = VC開始
      if (humanCount === 1) {
        // VC開始Embed
        if (logChannel?.isTextBased()) {
          const startEmbed = new EmbedBuilder()
            .setColor(0x00AEEF)
            .setTitle('🎧 VC開始')
            .setDescription(`VC「${baseName}」が開始されました。`)
            .setTimestamp();
          await logChannel.send({ embeds: [startEmbed] });
        }

        // online音声（ON のときだけ & 1人目だけ）
        if (VC_PLAY_ONLINE_SOUND) {
          console.log('try play online sound on vc:', vc.id, 'path:', VC_ONLINE_SOUND_PATH);
          try {
            const connection = joinVoiceChannel({
              channelId: vc.id,
              guildId: vc.guild.id,
              adapterCreator: vc.guild.voiceAdapterCreator,
            });

            const player = createAudioPlayer({
              behaviors: { noSubscriber: NoSubscriberBehavior.Stop },
            });

            const resource = createAudioResource(VC_ONLINE_SOUND_PATH);
            player.play(resource);
            connection.subscribe(player);

            player.on('error', (err) => {
              console.error('audio player error:', err);
            });

            player.once(AudioPlayerStatus.Playing, () => {
              console.log('online sound: now playing');
            });

            player.once(AudioPlayerStatus.Idle, () => {
              console.log('online sound: finished, disconnect');
              connection.destroy();
            });

          } catch (err) {
            console.error('online音声再生エラー:', err);
          }
        }
      }

      // 入室ログ（毎回）
      if (logChannel?.isTextBased()) {
        const joinEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🟢 VC入室')
          .setDescription(
            [
              `${user} が VC「${baseName}」に参加しました。`,
              `現在：**${humanCount}名**`,
            ].join('\n')
          )
          .setTimestamp();
        await logChannel.send({ embeds: [joinEmbed] });
      }

      // チャンネル名を REC 表示に更新
      try {
        await vc.setName(`🎙️｜🔴REC：会話中${humanCount}名`);
      } catch (err) {
        console.error('VC名変更エラー(入室):', err);
      }
    }

    // === 2) このVCから「出た」ケース ===
    if (beforeId === vcId && afterId !== vcId) {
      if (humanCount === 0) {
        // 全員退出 → VC終了
        if (logChannel?.isTextBased()) {
          const endEmbed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('🔴 VC終了')
            .setDescription(`VC「${baseName}」から全員が退出しました。`)
            .setTimestamp();
          await logChannel.send({ embeds: [endEmbed] });
        }

        // チャンネル名を元に戻す
        try {
          await vc.setName(baseName);
        } catch (err) {
          console.error('VC名変更エラー(終了):', err);
        }
      } else {
        // まだ人がいる → 人数だけ更新（退出ログ付き）
        if (logChannel?.isTextBased()) {
          const leaveEmbed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('🟡 VC退出')
            .setDescription(
              [
                `${user} が VC「${baseName}」から退出しました。`,
                `現在：**${humanCount}名**`,
              ].join('\n')
            )
            .setTimestamp();
          await logChannel.send({ embeds: [leaveEmbed] });
        }

        try {
          await vc.setName(`🎙️｜🔴REC：会話中${humanCount}名`);
        } catch (err) {
          console.error('VC名変更エラー(退出):', err);
        }
      }
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ===== スラッシュコマンド =====
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      // 共通: season / seasonLabel（/moti_input 以外で使う）
      const optionSeason = interaction.options.getString('season');
      const season = optionSeason || CURRENT_SEASON;
      const seasonLabel = season || '全期間';

      // ---------- /moti_input → モーダル表示 ----------
      if (commandName === 'moti_input') {
        const modal = new ModalBuilder()
          .setCustomId('motiInputModal') // シーズンは customId ではなくフィールドで持つ
          .setTitle('モチベ記録入力');

        // シーズン入力欄
        const seasonInput = new TextInputBuilder()
          .setCustomId('season')
          .setLabel('対象シーズン（例: S35）※空欄なら現在シーズン')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('S35');

        // 順位
        const rankInput = new TextInputBuilder()
          .setCustomId('rank')
          .setLabel('現在の順位（数字のみ）')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('例: 3');

        // 育成数
        const growInput = new TextInputBuilder()
          .setCustomId('grow')
          .setLabel('現在の育成数（数字のみ）')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('例: 1252');

        modal.addComponents(
          new ActionRowBuilder().addComponents(seasonInput),
          new ActionRowBuilder().addComponents(rankInput),
          new ActionRowBuilder().addComponents(growInput),
        );

        await interaction.showModal(modal);
        return;
      }

                // /moti_me → 自分の推移
      if (commandName === 'moti_me') {
        const userId = interaction.user.id;
        const myRecords = await getRecordsByUser(userId, season);

        if (!myRecords.length) {
          await interaction.reply({
            content: `${seasonLabel} の記録がまだありません。/moti_input で記録を追加してください。`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        myRecords.sort((a, b) => a.timestamp - b.timestamp);
        const latest = myRecords.slice(-10);
        const rankHistory = latest.map((r) => r.rank);
        const growHistory = latest.map((r) => r.grow);

        const lastRank = rankHistory[rankHistory.length - 1];
        const prevRank = rankHistory[rankHistory.length - 2] ?? lastRank;

        const lastGrow = growHistory[growHistory.length - 1];
        const prevGrow = growHistory[growHistory.length - 2] ?? lastGrow;

        const rankDiff = lastRank - prevRank;
        const growDiff = lastGrow - prevGrow;

        // サークル平均（同シーズン・直近2回分の増加量）
        const allRecords = await getAllRecords(season);
        const byUser = new Map();
        for (const r of allRecords) {
          if (!byUser.has(r.userId)) byUser.set(r.userId, []);
          byUser.get(r.userId).push(r);
        }

        const latestDeltas = [];
        for (const recs of byUser.values()) {
          recs.sort((a, b) => a.timestamp - b.timestamp);
          if (recs.length >= 2) {
            const last = recs[recs.length - 1];
            const prev = recs[recs.length - 2];
            latestDeltas.push(last.grow - prev.grow);
          }
        }

        const avgDelta = latestDeltas.length
          ? latestDeltas.reduce((a, b) => a + b, 0) / latestDeltas.length
          : 0;

        const diffFromAvg = growDiff - avgDelta;

        const growMark =
          diffFromAvg > 0 ? '🟢' :
          diffFromAvg < 0 ? '🔻' :
          '➖';

        const embed = new EmbedBuilder()
          .setTitle(`📊 ${seasonLabel} の ${interaction.user.username} さんの成績推移`)
          .setDescription('最新10回分の記録です。')
          .setColor(0xff4d4d)
          .addFields(
            {
              name: '順位推移',
              value:
                `${rankHistory.join(' → ')}\n` +
                `直近変化: ${rankDiff >= 0 ? '+' : ''}${rankDiff}`,
            },
            {
              name: '育成数推移',
              value:
                `${prevGrow} → ${lastGrow}\n` +
                `直近増加: +${growDiff}（サークル平均 +${avgDelta.toFixed(1)}）${growMark}`,
            },
          );

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

            // /moti_summary → 直近5シーズンのシーズン別まとめ
      if (commandName === 'moti_summary') {
        const user = interaction.user;
        const summary = await buildSeasonSummaryForUser(user.id, user.username, 5);

        if (!summary) {
          await interaction.reply({
            content: 'まだ記録がありません。/moti_input で記録を追加してください。',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(summary.title + '（直近5シーズン）')
          .setDescription(summary.description)
          .setColor(0xff4d4d);

        // 1024文字制限を考慮して分割
        let current = '';
        const fields = [];

        for (const line of summary.lines.slice(-5)) {
          const block = (current ? '\n\n' : '') + line;
          if ((current + block).length > 1024) {
            fields.push(current);
            current = line;
          } else {
            current += block;
          }
        }
        if (current) fields.push(current);

        fields.forEach((value, index) => {
          embed.addFields({
            name: index === 0 ? 'シーズン別サマリー' : '\u200b',
            value,
          });
        });

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // /moti_summary_all → 全シーズンのシーズン別まとめ
      if (commandName === 'moti_summary_all') {
        const user = interaction.user;
        const summary = await buildSeasonSummaryForUser(user.id, user.username, null);

        if (!summary) {
          await interaction.reply({
            content: 'まだ記録がありません。/moti_input で記録を追加してください。',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(summary.title + '（全期間）')
          .setDescription(summary.description)
          .setColor(0xff4d4d);

        // 文字数制限を考慮して分割
        let current = '';
        const fields = [];

        for (const line of summary.lines) {
          const block = (current ? '\n\n' : '') + line;
          if ((current + block).length > 1024) {
            fields.push(current);
            current = line;
          } else {
            current += block;
          }
        }
        if (current) fields.push(current);

        fields.forEach((value, index) => {
          embed.addFields({
            name: index === 0 ? 'シーズン別サマリー' : '\u200b',
            value,
          });
        });

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // ---------- /moti_report → 全員分（運営専用） ----------
      if (commandName === 'moti_report') {
        const member = interaction.member;
        if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({
            content: 'このコマンドは運営のみ実行できます。',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const records = await getAllRecords(season);
        if (!records.length) {
          await interaction.reply({
            content: `${seasonLabel} の記録がまだありません。`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const byUser = new Map();
        for (const r of records) {
          if (!byUser.has(r.userId)) byUser.set(r.userId, []);
          byUser.get(r.userId).push(r);
        }

        const latestDeltas = [];
        for (const recs of byUser.values()) {
          recs.sort((a, b) => a.timestamp - b.timestamp);
          if (recs.length >= 2) {
            const last = recs[recs.length - 1];
            const prev = recs[recs.length - 2];
            latestDeltas.push(last.grow - prev.grow);
          }
        }

        const avgDelta = latestDeltas.length
          ? latestDeltas.reduce((a, b) => a + b, 0) / latestDeltas.length
          : 0;

        const embed = new EmbedBuilder()
          .setTitle(`今週の成績推移レポート（${seasonLabel}）`)
          .setDescription('各メンバーの順位・育成数の直近推移と平均との差をまとめています。');

        for (const [userId, recs] of byUser.entries()) {
          recs.sort((a, b) => a.timestamp - b.timestamp);
          const latest = recs.slice(-10);

          const username = latest[latest.length - 1].username ?? 'Unknown';

          const ranks = latest.map(r => r.rank);
          const grows = latest.map(r => r.grow);

          const lastRank = ranks[ranks.length - 1];
          const prevRank = ranks[ranks.length - 2] ?? lastRank;

          const lastGrow = grows[grows.length - 1];
          const prevGrow = grows[grows.length - 2] ?? lastGrow;

          const rankDiff = lastRank - prevRank;
          const growDiff = lastGrow - prevGrow;
          const diffFromAvg = growDiff - avgDelta;

          const growMark =
            diffFromAvg > 0 ? '🔺' :
            diffFromAvg < 0 ? '🔻' :
            '➖';

          const rankText = ranks.join(' → ');
          const growText = `${prevGrow} → ${lastGrow}`;

          embed.addFields({
            name: `🎤 ${username}`,
            value:
              `順位: ${rankText}\n` +
              `　┗ 直近変化: ${rankDiff >= 0 ? '+' : ''}${rankDiff}\n\n` +
              `育成数: ${growText}\n` +
              `　┗ 直近増加: +${growDiff}（平均 ${avgDelta.toFixed(1)}）${growMark}`,
            inline: false,
          });
        }

        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // ---------- /moti_notion → Notion用表（運営専用） ----------
      if (commandName === 'moti_notion') {
        const member = interaction.member;
        if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({
            content: 'このコマンドは運営のみ実行できます。',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const records = await getAllRecords(season);
        if (!records.length) {
          await interaction.reply({
            content: `${seasonLabel} の記録がまだありません。`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const byUser = new Map();
        for (const r of records) {
          if (!byUser.has(r.userId)) byUser.set(r.userId, []);
          byUser.get(r.userId).push(r);
        }

        const latestDeltas = [];
        for (const recs of byUser.values()) {
          recs.sort((a, b) => a.timestamp - b.timestamp);
          if (recs.length >= 2) {
            const last = recs[recs.length - 1];
            const prev = recs[recs.length - 2];
            latestDeltas.push(last.grow - prev.grow);
          }
        }

        const avgDelta = latestDeltas.length
          ? latestDeltas.reduce((a, b) => a + b, 0) / latestDeltas.length
          : 0;

        let notionTable =
          '| メンバー | 順位推移 | 最終順位 | 直近順位変化 | 育成数推移 | 直近増加数 | 増加数平均との差 |\n' +
          '|---------|----------|----------|--------------|------------|------------|-----------------|\n';

        for (const [userId, recs] of byUser.entries()) {
          recs.sort((a, b) => a.timestamp - b.timestamp);
          const latest = recs.slice(-10);

          const username = latest[latest.length - 1].username ?? 'Unknown';

          const ranks = latest.map(r => r.rank);
          const grows = latest.map(r => r.grow);

          const lastRank = ranks[ranks.length - 1];
          const prevRank = ranks[ranks.length - 2] ?? lastRank;

          const lastGrow = grows[grows.length - 1];
          const prevGrow = grows[grows.length - 2] ?? lastGrow;

          const rankDiff = lastRank - prevRank;
          const growDiff = lastGrow - prevGrow;
          const diffFromAvg = growDiff - avgDelta;

          const rankText = ranks.join(' → ');
          const growText = `${prevGrow} → ${lastGrow}`;

          notionTable += `| ${username} | ${rankText} | ${lastRank}位 | ${rankDiff >= 0 ? '+' : ''}${rankDiff} | ${growText} | +${growDiff} | ${diffFromAvg >= 0 ? '+' : ''}${diffFromAvg.toFixed(1)} |\n`;
        }

        await interaction.reply({
          content: '```markdown\n' + notionTable + '\n```',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

     // 使い方ガイド（全員が利用可・エフェメラル表示）
if (commandName === 'moti_help') {
  const embed = new EmbedBuilder()
    .setTitle('📘 成績通知表システムの使い方')
    .setColor(0x3b82f6) // 明るめの青。好みに合わせて変更OK
    .setDescription(
      [
        '┃このシステムでは、自分の「順位」と「育成数（累計）」を記録し、シーズンごとの伸びを見える化します。',
        '┃まずは `/moti_input` で記録し、`/moti_me` や `/moti_me_season` で推移を確認してください。'
      ].join('\n')
    )
    .addFields(
      {
        name: '🧩 基本コマンド（全員が利用可能）',
        value: [
          '**1️⃣ `/moti_input` – 記録の登録**',
          '∥ その時点の成績を 1 回分だけ記録します。',
          '∥ 入力フォームの項目',
          '　・対象シーズン（任意）… `S35` など。空欄なら「現在シーズン」',
          '　・現在の順位 … 数字のみ',
          '　・現在の育成数 … 数字のみ（その時点での累計育成回数）',
          '',
          '**2️⃣ `/moti_me` – 直近10件の推移**',
          '∥ 自分の最新10件の記録から、順位と育成数の推移を表示します。',
          '∥ 育成数には、サークル平均の増加量との比較が付きます。',
          '　・🟢 … サークル平均より増加が大きい',
          '　・🔻 … サークル平均より増加が小さい',
          '　・➖ … サークル平均とほぼ同じ',
        ].join('\n'),
      },
      {
        name: '📈 シーズン別・全期間サマリー',
        value: [
          '**3️⃣ `/moti_me_season` – シーズン別まとめ（直近5シーズン）**',
          '∥ 直近5シーズンについて、各シーズンで「どれくらい育成したか」を一覧表示します。',
          '∥ 1シーズンごとに、増加数と「サークル平均」との差が表示されます。',
          '',
          '**4️⃣ `/moti_me_all` – 全期間サマリー**',
          '∥ これまでの全シーズンについて、シーズンごとの増加数を一覧表示します。',
          '∥ 一番下に、全シーズン合計の育成数とサークル平均との比較も表示されます。',
        ].join('\n'),
      },
      {
        name: '🛠 運営専用コマンド（ManageGuild 権限のみ）',
        value: [
          '**5️⃣ `/moti_report` – サークル全体レポート**',
          '∥ 指定シーズンの全メンバーについて、',
          '　　直近の順位推移・育成数の増加・サークル平均との差をまとめて表示します。',
          '',
          '**6️⃣ `/moti_notion` – Notion 用サマリー**',
          '∥ 指定シーズンのデータを、Notion に貼り付け可能な表形式で出力します。',
          '∥ メンバー名 / 順位推移 / 最終順位 / 直近の増減 / 育成数推移 / サークル平均との差 などを含みます。',
        ].join('\n'),
      }
    );

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral, // 自分にだけ見える
  });
  return;
}
    }

    // ===== モーダル送信（/moti_input のフォーム） =====
    if (interaction.isModalSubmit() && interaction.customId === 'motiInputModal') {
      const seasonInput = interaction.fields.getTextInputValue('season').trim();
      const season = seasonInput || CURRENT_SEASON; // 空なら現在シーズン

      const rank = parseInt(interaction.fields.getTextInputValue('rank'), 10);
      const grow = parseInt(interaction.fields.getTextInputValue('grow'), 10);

      if (Number.isNaN(rank) || Number.isNaN(grow)) {
        await interaction.reply({
          content: '数字を入力してください。',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await appendRecord(interaction.user.id, interaction.user.username, rank, grow, season);

      await interaction.reply({
        content: `✅ 記録しました。\nシーズン: ${season}\n順位: ${rank}\n育成数: ${grow}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  } catch (err) {
    console.error('moti interaction error:', err);

    const msg = 'エラーが発生しました。時間をおいて再度お試しください。';

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: msg });
      } else {
        await interaction.reply({
          content: msg,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (replyErr) {
      console.error('moti error reply failed:', replyErr);
    }
  }
});




// ===== Botログイン =====
client.login(TOKEN).catch(err => {
  console.error("❌ ログイン失敗:", err);
});


 