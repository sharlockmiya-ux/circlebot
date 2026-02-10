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

  // ユーザー運用ルール：毎朝6:30頃の「まとめツイート」には毎回「業務連絡」が入っている
  // → 誤爆/取りこぼしを減らすため、まず「業務連絡」を必須条件にする。
  //   keywordsAll に【業務連絡】などを入れても良いが、表記ゆれ対策でここでも拾う。
  if (!/業務連絡/.test(t)) return false;

  // keywordsAll/Any は “追加条件” として扱う（運用で調整できるよう残す）
  if (!includesAll(t, keywordsAll)) return false;
  if (!includesAny(t, keywordsAny)) return false;

  // 追加の保険：締切/〆切/締め切り/期限 のいずれかを含む
  // ※ツイートは「2/10〆切」など“本日/今日”を含まない表記があるため、
  //   notifier 側の「今日(JST)」＋「投稿時間帯(5〜9時)」条件で担保する。
  // 追加の保険：締切/期限の単語が無くても、日付っぽい表記があれば通す。
  const hasDeadlineWord = /締切|〆切|締め切り|締め切|期限/.test(t);
  const hasDateLike = /(\d{1,2}\/\d{1,2})|(\d{1,2}月\d{1,2}日)/.test(t);
  if (!hasDeadlineWord && !hasDateLike) return false;

  return true;
}

module.exports = { isTargetTweetText };
