// src/features/xGoodsNotifier/matcher.js
// 「本日締切グッズまとめ」っぽい投稿だけを拾うための判定
//
// NOTE:
// - ユーザー要件（6:30の対象ツイートには毎回「業務連絡」が入る）を踏まえ、
//   過剰な条件（締切ワード必須など）で取り逃さないようにする。
// - 判定は config の keywordsAll/keywordsAny で調整可能。

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
  return (words || []).some((w) => w && text.includes(w));
}

function isTargetTweetText(text, { keywordsAll, keywordsAny } = {}) {
  const t = normalizeText(text);
  if (!t) return false;

  if (!includesAll(t, keywordsAll)) return false;
  if (!includesAny(t, keywordsAny)) return false;

  return true;
}

module.exports = {
  isTargetTweetText,
};
