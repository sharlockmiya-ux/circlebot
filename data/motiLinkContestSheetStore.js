// data/motiLinkContestSheetStore.js
// Google Sheets 連携：サービスアカウントで「リンクコンテスト」シートを読み書き
// ※既存の data/motiSheetStore.js は変更せず、別シート用のストアを追加する

const { google } = require('googleapis');

// ===== 環境変数の取得 =====
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SERVICE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const RAW_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

// 既定のシート名（必要なら env で差し替え可能）
const LINK_CONTEST_SHEET_NAME = process.env.LINK_CONTEST_SHEET_NAME || 'リンクコンテスト';

// .env では \n で書いている想定なので、実行時に本物の改行に変換
const PRIVATE_KEY = RAW_PRIVATE_KEY ? RAW_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

// デバッグ用：環境変数の状態をざっくり出す（中身そのものは出さない）
console.log('[motiLinkContestSheetStore] env check:', {
  hasSpreadsheetId: !!SPREADSHEET_ID,
  hasServiceEmail: !!SERVICE_EMAIL,
  privateKeyLength: PRIVATE_KEY ? PRIVATE_KEY.length : 0,
  sheetName: LINK_CONTEST_SHEET_NAME,
});

// ===== Google Sheets クライアント作成 =====
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: SERVICE_EMAIL,
    private_key: PRIVATE_KEY,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

function buildRangeAtoF() {
  return `${LINK_CONTEST_SHEET_NAME}!A:F`; // userId | username | timestamp | rank | grow | season
}

async function fetchAllLinkContestRecords() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: buildRangeAtoF(),
  });

  const values = res.data.values || [];
  const rows = values.slice(1); // 1行目はヘッダー

  return rows.map((row) => {
    const [
      userId = '',
      username = '',
      timestamp = '',
      rank = '',
      grow = '',
      season = '',
    ] = row;

    return {
      userId,
      username,
      timestamp: new Date(timestamp),
      rank: Number(rank),
      grow: Number(grow),
      season: season || '',
    };
  });
}

// ===== 1件追加（/moti_input_link 用） =====
async function appendLinkContestRecord(userId, username, rank, grow, season) {
  const timestamp = new Date().toISOString();

  const values = [[
    String(userId),
    String(username),
    timestamp,
    Number(rank),
    Number(grow),
    String(season || ''),
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: buildRangeAtoF(),
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

async function getLinkContestRecordsByUser(userId, season) {
  const all = await fetchAllLinkContestRecords();
  return all.filter((r) => {
    if (String(r.userId) !== String(userId)) return false;
    if (season && r.season !== season) return false;
    return true;
  });
}

async function getAllLinkContestRecords(season) {
  const all = await fetchAllLinkContestRecords();
  if (!season) return all;
  return all.filter((r) => r.season === season);
}

module.exports = {
  appendLinkContestRecord,
  getLinkContestRecordsByUser,
  getAllLinkContestRecords,
};
