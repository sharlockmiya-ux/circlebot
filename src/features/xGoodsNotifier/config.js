// src/features/xGoodsNotifier/config.js
// X（旧Twitter）の「本日締切グッズまとめ」投稿を通知する設定をまとめて取得

const { loadServerConfig } = require('../../config');

function parseCsvMaybe(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v;
  const s = String(v).trim();
  if (!s) return null;
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function toFiniteNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(n, min, max) {
  const i = Math.trunc(n);
  if (!Number.isFinite(i)) return min;
  return Math.max(min, Math.min(max, i));
}

function getXGoodsNotifierConfig() {
  const cfg = loadServerConfig();
  const section = cfg?.xGoodsNotifier || {};

  // enabled は「永続状態(stateStore)」が優先。
  // ここはデフォルト値としてのみ使う。
  const enabledDefault = section.enabled !== undefined ? !!section.enabled : true;

  const channelId =
    process.env.X_GOODS_NOTIFIER_CHANNEL_ID ||
    section.channelId ||
    null;

  const username =
    process.env.X_GOODS_NOTIFIER_USERNAME ||
    section.username ||
    'zutapoke';

  // --- 読み取り最小化（重要） ---
  // X API は返ってきた投稿数（読み取り数）で課金/上限が効くことがあるため、
  // cron（毎日の自動実行）は「少数＋since_id」で最小化し、
  // 手動テストは少し多めに読めるように分ける。

  // 旧設定（maxResults）との互換
  const legacyMaxResults = toFiniteNumber(
    process.env.X_GOODS_NOTIFIER_MAX_RESULTS ?? section.maxResults ?? null,
    null,
  );

  const cronMaxResultsRaw =
    process.env.X_GOODS_NOTIFIER_CRON_MAX_RESULTS ??
    section.cronMaxResults ??
    section.maxResultsCron ??
    null;

  const testMaxResultsRaw =
    process.env.X_GOODS_NOTIFIER_TEST_MAX_RESULTS ??
    section.testMaxResults ??
    section.maxResultsTest ??
    null;

  // cron は “6:35 に 6:30 のツイートを拾う” 前提なので 3〜25 に強く制限
  const cronMaxResults = clampInt(
    toFiniteNumber(cronMaxResultsRaw, legacyMaxResults ?? 5),
    3,
    25,
  );

  // 手動テストは少し広め（ただし 100 上限）
  const testMaxResults = clampInt(
    toFiniteNumber(testMaxResultsRaw, legacyMaxResults ?? 25),
    5,
    100,
  );

  // マッチ条件（調整用）
  const keywordsAll =
    parseCsvMaybe(process.env.X_GOODS_NOTIFIER_KEYWORDS_ALL) ||
    section.keywordsAll ||
    [];

  const keywordsAny =
    parseCsvMaybe(process.env.X_GOODS_NOTIFIER_KEYWORDS_ANY) ||
    section.keywordsAny ||
    [];

  // 投稿時刻の想定（JST）: 6:30頃
  const minHourJst = toFiniteNumber(
    process.env.X_GOODS_NOTIFIER_MIN_HOUR_JST ?? section.minHourJst ?? 5,
    5,
  );
  const maxHourJst = toFiniteNumber(
    process.env.X_GOODS_NOTIFIER_MAX_HOUR_JST ?? section.maxHourJst ?? 9,
    9,
  );

  // 返信を除外するか（既定: true）。
  // ※返信を除外すると読み取り数は変わらないが、候補が返信ツイートの場合は拾えない。
  const excludeRepliesRaw =
    process.env.X_GOODS_NOTIFIER_EXCLUDE_REPLIES ?? section.excludeReplies;
  const excludeReplies = excludeRepliesRaw === undefined
    ? true
    : String(excludeRepliesRaw).toLowerCase() !== 'false';

  return {
    enabledDefault,
    channelId,
    username,
    cronMaxResults,
    testMaxResults,
    keywordsAll,
    keywordsAny,
    minHourJst,
    maxHourJst,
    excludeReplies,
  };
}

module.exports = { getXGoodsNotifierConfig };
