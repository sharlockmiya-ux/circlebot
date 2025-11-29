// data/motiSheetStore.js
require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SERVICE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
const DEFAULT_SEASON = process.env.MOTI_CURRENT_SEASON || 'S35';

if (!SPREADSHEET_ID || !SERVICE_EMAIL || !PRIVATE_KEY) {
  console.warn('[motiSheetStore] .env の SPREADSHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY を確認してください。');
}

const auth = new google.auth.JWT(
  SERVICE_EMAIL,
  null,
  PRIVATE_KEY,
  ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth });

/**
 * 1件追加（/moti_input 用）
 */
async function appendRecord(userId, username, rank, grow, season) {
  const timestamp = new Date().toISOString(); // UTC
  const usedSeason = season || DEFAULT_SEASON;

  const values = [[userId, username, timestamp, rank, grow, usedSeason]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: '記録!A:F', // 記録タブ A〜F
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

/**
 * 全レコード取得（必要ならシーズンで絞り込み）
 * @param {string|null} targetSeason 例: 'S35' / nullなら全期間
 */
async function getAllRecords(targetSeason = null) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: '記録!A2:F', // 2行目以降
  });

  const rows = res.data.values || [];

  let records = rows.map((r) => ({
    userId: r[0],
    username: r[1],
    timestamp: new Date(r[2]),
    rank: Number(r[3]),
    grow: Number(r[4]),
    season: r[5] || null,
  }));

  if (targetSeason) {
    records = records.filter((rec) => rec.season === targetSeason);
  }

  return records;
}

/**
 * 特定ユーザーのレコード取得
 */
async function getRecordsByUser(userId, targetSeason = null) {
  const all = await getAllRecords(targetSeason);
  return all.filter(r => r.userId === userId);
}

module.exports = {
  appendRecord,
  getAllRecords,
  getRecordsByUser,
};
