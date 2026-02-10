// src/features/xGoodsNotifier/matcher.js
// 「業務連絡」入りの投稿だけを拾う（ユーザー運用：他に業務連絡を使うツイートは無い）
// 読み取りコスト最小化のため、判定は“単純に”する。

function normalizeText(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function includesAll(text, words) {
  return (words || []).every((w) => w && text.includes(w));
}

function isTargetTweetText(text, cfg) {
  const t = normalizeText(text);
  if (!t) return false;

  // B案：本文に「業務連絡」が入っていれば候補とする。
  // ※将来の調整用に keywordsAll を優先し、未設定なら ['業務連絡'] を使う。
  const required = (cfg?.keywordsAll && cfg.keywordsAll.length > 0)
    ? cfg.keywordsAll
    : ['業務連絡'];

  return includesAll(t, required);
}

module.exports = { isTargetTweetText };
