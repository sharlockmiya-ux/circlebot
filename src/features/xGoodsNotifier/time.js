// src/features/xGoodsNotifier/time.js
// JST ベースで「今日」を判定するための小物

const JST_TZ = 'Asia/Tokyo';

function formatJstYmd(date) {
  // YYYY-MM-DD
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: JST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
}

function formatJstHm(date) {
  const fmt = new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return fmt.format(date);
}

function getJstHour(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: JST_TZ,
    hour: '2-digit',
    hour12: false,
  });
  const s = fmt.format(date);
  return Number(s);
}

module.exports = {
  JST_TZ,
  formatJstYmd,
  formatJstHm,
  getJstHour,
};
