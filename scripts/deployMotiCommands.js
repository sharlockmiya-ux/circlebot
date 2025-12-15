// scripts/deployMotiCommands.js
// v15方針：サーバー固有IDは src/config/servers/<name>.json から取得
// secrets（DISCORD_TOKEN / CLIENT_ID）は env から取得

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

function readArgValue(flagName) {
  const idx = process.argv.indexOf(flagName);
  if (idx === -1) return null;
  const v = process.argv[idx + 1];
  if (!v || String(v).startsWith('-')) return null;
  return v;
}

function listServerProfiles(serversDir) {
  try {
    return fs
      .readdirSync(serversDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

function loadServerConfig(profile) {
  const serversDir = path.join(__dirname, '..', 'src', 'config', 'servers');
  const filePath = path.join(serversDir, `${profile}.json`);

  if (!fs.existsSync(filePath)) {
    const profiles = listServerProfiles(serversDir);
    const hint = profiles.length ? `Available: ${profiles.join(', ')}` : 'No profiles found.';
    throw new Error(`[DEPLOY] Server profile "${profile}" not found. Expected: ${filePath}\n${hint}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const cfg = JSON.parse(raw);

  if (!cfg.guildId) {
    throw new Error('[DEPLOY] guildId is required in server config (src/config/servers/<name>.json)');
  }

  return cfg;
}

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// secrets は env 必須（ここはconfigへ移さない）
if (!TOKEN) {
  console.error('[DEPLOY] Missing required env: DISCORD_TOKEN');
  process.exit(1);
}
if (!CLIENT_ID) {
  console.error('[DEPLOY] Missing required env: CLIENT_ID');
  process.exit(1);
}

// GUILD_ID は env からではなく server config から取る（envがあれば上書き可）
const profile =
  readArgValue('--server') ||
  process.env.SERVER_CONFIG_NAME ||
  process.env.SERVER_PROFILE ||
  'main';

let GUILD_ID;
try {
  const cfg = loadServerConfig(profile);
  GUILD_ID = process.env.GUILD_ID || cfg.guildId;
} catch (e) {
  console.error(e);
  process.exit(1);
}

const commands = [
  // --- シーズン記録系 ---
  new SlashCommandBuilder()
    .setName('moti_input')
    .setDescription('現在の順位と育成数を記録します。')
    .addStringOption(opt =>
      opt.setName('season')
        .setDescription('対象シーズン（例: S35）※省略時は現在シーズン')
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName('moti_me')
    .setDescription('自分の順位・育成数の推移を確認します。')
    .addStringOption(opt =>
      opt.setName('season')
        .setDescription('対象シーズン（例: S35）※省略時は現在シーズン')
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName('moti_summary')
    .setDescription('直近のシーズン別サマリーを表示します。'),

  new SlashCommandBuilder()
    .setName('moti_summary_all')
    .setDescription('全シーズン分のシーズン別成績まとめを表示します。'),

  new SlashCommandBuilder()
    .setName('moti_report')
    .setDescription('指定シーズンの成績推移レポートを表示します（運営専用）。')
    .addStringOption(opt =>
      opt.setName('season')
        .setDescription('対象シーズン（例: S35）※省略時は現在シーズン')
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('moti_notion')
    .setDescription('Notion用のサマリー表を出力します（運営専用）。')
    .addStringOption(opt =>
      opt.setName('season')
        .setDescription('対象シーズン（例: S35）※省略時は現在シーズン')
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('moti_help')
    .setDescription('成績通知表システムの使い方を表示します。'),

  // --- embed（誰でも利用可） ---
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Embedメッセージを作成します。')
    .setDMPermission(false),

  // --- 月間モチベ調査（一般メンバー用） ---
  new SlashCommandBuilder()
    .setName('moti_month_input')
    .setDescription('月間モチベーション（育成数・ファン数）を記録します。'),

  new SlashCommandBuilder()
    .setName('moti_month_me')
    .setDescription('自分の月間モチベ推移を確認します。'),

  // --- 月間モチベ集計（運営専用） ---
  new SlashCommandBuilder()
    .setName('moti_month_report')
    .setDescription('指定した月の月間モチベ集計を表示します（運営専用）。')
    .addStringOption(opt =>
      opt.setName('month')
        .setDescription('対象月（例: 2025-11）※省略時は今月')
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  // --- シーズン終了報告（運営専用） ---
  new SlashCommandBuilder()
    .setName('moti_season_close')
    .setDescription('シーズン終了時に、成績一覧を通知チャンネルへ投稿します（運営専用）。')
    .addStringOption(opt =>
      opt.setName('season')
        .setDescription('対象シーズン（例: S35）')
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('スラッシュコマンド登録中...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands },
    );
    console.log('登録完了');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
})();
