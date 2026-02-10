// src/features/xGoodsNotifier/matcher.js
// 「本日締切グッズまとめ」っぽい投稿だけを拾うための判定

function normalizeText(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function includesAll(text, words) {
  return (words || []).every((w) => w && text.includes(w));
}

function includesAny(text, words) {
  if (!words || words.length === 0) return true;
  return words.some((w) => w && text.includes(w));
}

function isTargetTweetText(text, { keywordsAll, keywordsAny }) {
  const t = normalizeText(text);
  if (!t) return false;

  if (!includesAll(t, keywordsAll)) return false;
  if (!includesAny(t, keywordsAny)) return false;

  // 追加の保険：締切/期限/本日 のいずれかを含む
  const hasDeadline = /締切|期限/.test(t) && /本日|今日/.test(t);
  if (!hasDeadline) return false;

  return true;
}

module.exports = { isTargetTweetText };
