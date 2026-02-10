// src/features/xGoodsNotifier/config.js
// X（旧Twitter）の「本日締切グッズまとめ」投稿を通知する設定をまとめて取得

const { loadServerConfig } = require('../../config');

function parseCsvMaybe(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v;
  const s = String(v).trim();
  if (!s) return null;
  return s.split(',').map((x) => x.trim()).filter(Boolean);
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

  // マッチ条件（調整用）
  // v10: B案（"業務連絡" を核にする）
  const keywordsAll =
    parseCsvMaybe(process.env.X_GOODS_NOTIFIER_KEYWORDS_ALL) ||
    section.keywordsAll ||
    ['業務連絡'];

  // v10: keywordsAny は基本空（必要なら env/main.json で追加）
  const keywordsAny =
    parseCsvMaybe(process.env.X_GOODS_NOTIFIER_KEYWORDS_ANY) ||
    section.keywordsAny ||
    [];

  // 投稿時刻の想定（JST）: 6:30頃（多少ズレても拾えるよう上側を少し広げる）
  const minHourJst =
    Number(process.env.X_GOODS_NOTIFIER_MIN_HOUR_JST ?? section.minHourJst ?? 6);
  const maxHourJst =
    Number(process.env.X_GOODS_NOTIFIER_MAX_HOUR_JST ?? section.maxHourJst ?? 8);

  // X API 読取最小化: 1回の取得件数（最低5 / 最大100）
  const maxResults = Number(process.env.X_GOODS_NOTIFIER_MAX_RESULTS ?? section.maxResults ?? 5);

  return {
    enabledDefault,
    channelId,
    username,
    keywordsAll,
    keywordsAny,
    minHourJst,
    maxHourJst,
    maxResults,
  };
}

module.exports = { getXGoodsNotifierConfig };
