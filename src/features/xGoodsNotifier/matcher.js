// src/features/xGoodsNotifier/matcher.js
// 「本日締切グッズまとめ」っぽい投稿だけを拾うための判定
//
// v11: 課金(読み取り)を増やさないため、判定はテキスト条件のみに寄せる。
//      「業務連絡」固定運用（B案）では keywordsAll=['業務連絡'] のみで十分。

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

  return true;
}

module.exports = { isTargetTweetText };
