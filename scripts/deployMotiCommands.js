// scripts/deployMotiCommands.js
require('dotenv').config();

const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

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
    .setDescription('全メンバーのレポートを表示します（運営専用）。')
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
  }
})();
