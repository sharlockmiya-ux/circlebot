// data/motiSheetStore.js
// Google Sheets 連携：サービスアカウントで「記録」シートを読み書き

const { google } = require('googleapis');

// ===== 環境変数の取得 =====
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SERVICE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const RAW_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

// .env では \n で書いている想定なので、実行時に本物の改行に変換
const PRIVATE_KEY = RAW_PRIVATE_KEY
  ? RAW_PRIVATE_KEY.replace(/\\n/g, '\n')
  : undefined;
  
// 起動時に最低限のチェックだけしておく（秘密情報は出さない）
if (!SPREADSHEET_ID || !SERVICE_EMAIL || !PRIVATE_KEY) {
  console.error('[motiSheetStore] ❌ 環境変数が足りません');
  console.error('[motiSheetStore] SPREADSHEET_ID:', !!SPREADSHEET_ID);
  console.error('[motiSheetStore] GOOGLE_SERVICE_ACCOUNT_EMAIL:', !!SERVICE_EMAIL);
  console.error('[motiSheetStore] GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:', !!PRIVATE_KEY);
}

// デバッグ用：環境変数の状態をざっくり出す（中身そのものは出さない）
console.log('[motiSheetStore] env check:', {
  hasSpreadsheetId: !!SPREADSHEET_ID,
  hasServiceEmail: !!SERVICE_EMAIL,
  privateKeyLength: PRIVATE_KEY ? PRIVATE_KEY.length : 0,
});

// 最低限の存在チェック（足りなければエラーを出す）
if (!SPREADSHEET_ID || !SERVICE_EMAIL || !PRIVATE_KEY) {
  console.error('[motiSheetStore] ✖ 環境変数が足りません');
  console.error('[motiSheetStore] SPREADSHEET_ID:', !!SPREADSHEET_ID);
  console.error('[motiSheetStore] GOOGLE_SERVICE_ACCOUNT_EMAIL:', !!SERVICE_EMAIL);
  console.error('[motiSheetStore] GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:', !!PRIVATE_KEY);
}


// ===== Google Sheets クライアント作成 =====
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: SERVICE_EMAIL,
    private_key: PRIVATE_KEY,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });


// ===== 共通：シートから全行を取得してオブジェクト配列に変換 =====
async function fetchAllRecords() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: '記録!A:F', // userId | username | timestamp | rank | grow | season
  });

  const values = res.data.values || [];

  // 1行目はヘッダーなのでスキップ
  const rows = values.slice(1);

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

// ===== 1件追加（/moti_input 用） =====
async function appendRecord(userId, username, rank, grow, season) {
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
    range: '記録!A:F',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

// ===== 指定ユーザーの記録全件（/moti_me 用） =====
async function getRecordsByUser(userId, season) {
  const all = await fetchAllRecords();
  return all.filter((r) => {
    if (String(r.userId) !== String(userId)) return false;
    if (season && r.season !== season) return false;
    return true;
  });
}

// ===== 指定シーズンの全メンバー記録（/moti_report, /moti_notion 用） =====
async function getAllRecords(season) {
  const all = await fetchAllRecords();
  if (!season) return all;
  return all.filter((r) => r.season === season);
}

module.exports = {
  appendRecord,
  getRecordsByUser,
  getAllRecords,
};
