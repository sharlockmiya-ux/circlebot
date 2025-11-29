// data/motiSheetStore.js
const { google } = require('googleapis');

// ===== 環境変数の読み込み =====
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

// デバッグ用ログ（中身そのものは出さない）
console.log('[moti] env check:',
  'sheet:', !!SPREADSHEET_ID,
  'email:', !!SERVICE_ACCOUNT_EMAIL,
  'keyLen:', PRIVATE_KEY ? PRIVATE_KEY.length : 0,
);

// Render / .env で `\n` 付き 1 行文字列になっている場合に改行に戻す
if (PRIVATE_KEY && PRIVATE_KEY.includes('\\n')) {
  PRIVATE_KEY = PRIVATE_KEY.replace(/\\n/g, '\n');
}

// ===== Google 認証クライアント作成 =====
const auth = new google.auth.JWT(
  SERVICE_ACCOUNT_EMAIL,
  undefined,
  PRIVATE_KEY,
  ['https://www.googleapis.com/auth/spreadsheets'],
);

const sheets = google.sheets('v4');

// 1行レコードに変換
function toRecord(row) {
  if (!row || row.length < 6) return null;
  const [userId, username, timestamp, rank, grow, season] = row;
  return {
    userId,
    username,
    timestamp: new Date(timestamp),
    rank: Number(rank) || 0,
    grow: Number(grow) || 0,
    season: season || '',
  };
}

// ====== 1件追記 ======
async function appendRecord(userId, username, rank, grow, season) {
  if (!SPREADSHEET_ID) {
    throw new Error('SPREADSHEET_ID が設定されていません');
  }

  const now = new Date().toISOString();
  const values = [[String(userId), username, now, rank, grow, season]];

  await sheets.spreadsheets.values.append({
    auth,
    spreadsheetId: SPREADSHEET_ID,
    range: '記録!A:F',
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

// ====== 全レコード取得 ======
async function getAllRecords(season) {
  if (!SPREADSHEET_ID) {
    throw new Error('SPREADSHEET_ID が設定されていません');
  }

  const res = await sheets.spreadsheets.values.get({
    auth,
    spreadsheetId: SPREADSHEET_ID,
    range: '記録!A:F',
  });

  const rows = res.data.values || [];
  // 1 行目はヘッダー想定
  const dataRows = rows.slice(1);
  let records = dataRows.map(toRecord).filter(Boolean);

  if (season) {
    records = records.filter(r => r.season === season);
  }

  return records;
}

// ====== 特定ユーザーのレコード取得 ======
async function getRecordsByUser(userId, season) {
  const all = await getAllRecords(season);
  return all.filter(r => r.userId === String(userId));
}

module.exports = {
  appendRecord,
  getAllRecords,
  getRecordsByUser,
};
