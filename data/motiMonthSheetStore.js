// data/motiMonthSheetStore.js
// 「月間調査」シートを読み書きする専用モジュール

const { google } = require('googleapis');

// ===== 環境変数 =====
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SERVICE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const RAW_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

// .env では \n 区切りなので実行時に本物の改行へ変換
const PRIVATE_KEY = RAW_PRIVATE_KEY
  ? RAW_PRIVATE_KEY.replace(/\\n/g, '\n')
  : undefined;

// 共通の Sheets クライアントを作るヘルパー
function createSheetsClient() {
  if (!SPREADSHEET_ID || !SERVICE_EMAIL || !PRIVATE_KEY) {
    throw new Error('motiMonthSheetStore: Google Sheets の設定が不足しています。');
  }

  const auth = new google.auth.JWT({
    email: SERVICE_EMAIL,
    key: PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// 1行をオブジェクトに変換（ヘッダー行は呼ばない想定）
function rowToMonthlyRecord(row) {
  // 旧: A:F = userId, username, timestamp, monthKey, grow, fans
  // 新: A:H = userId, username, timestamp, monthKey, grow(diff), fans(diff), grow_total, fans_total
  const [userId, username, timestamp, monthKey, grow, fans, growTotal, fansTotal] = row;

  if (!userId) return null;

  const ts = timestamp ? new Date(timestamp) : null;
  const mk =
    monthKey ||
    (ts ? ts.toISOString().slice(0, 7) : null); // YYYY-MM

  return {
    userId: String(userId),
    username: username || '',
    timestamp: ts,
    monthKey: mk,
    grow: Number(grow) || 0,
    fans: Number(fans) || 0,
    // 新列（存在しない旧データでは undefined になる）
    growTotal: growTotal === undefined ? undefined : (Number(growTotal) || 0),
    fansTotal: fansTotal === undefined ? undefined : (Number(fansTotal) || 0),
  };
}

// ----- 1件追加 -----
// grow/fans は「増加分（diff）」を保存する想定。
// growTotal/fansTotal は「ゲーム上の実累計」を保存する想定。
async function appendMonthlyRecord(userId, username, grow, fans, monthKeyInput, growTotal, fansTotal) {
  const sheets = createSheetsClient();

  const now = new Date();
  const iso = now.toISOString();

  let monthKey = monthKeyInput;
  if (!monthKey) {
    monthKey = iso.slice(0, 7); // YYYY-MM
  }

  const values = [[
    String(userId),
    String(username),
    iso,
    monthKey,
    Number(grow) || 0,
    Number(fans) || 0,
    // 新列（合計）：未指定でも 0 を入れておく（列数揃えのため）
    growTotal === undefined ? '' : (Number(growTotal) || 0),
    fansTotal === undefined ? '' : (Number(fansTotal) || 0),
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: '月間調査!A:H',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

// ----- 全件取得 -----
async function getAllMonthlyRecords() {
  const sheets = createSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    // 旧シートは A:F しかなくても OK（足りない列は undefined になる）
    range: '月間調査!A:H',
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return [];

  return rows.slice(1) // 1行目ヘッダーを除外
    .map(rowToMonthlyRecord)
    .filter(Boolean);
}

// ----- ユーザー別取得 -----
async function getMonthlyRecordsByUser(userId) {
  const all = await getAllMonthlyRecords();
  return all.filter((r) => r.userId === String(userId));
}

module.exports = {
  appendMonthlyRecord,
  getAllMonthlyRecords,
  getMonthlyRecordsByUser,
};
