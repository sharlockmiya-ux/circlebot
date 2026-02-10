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


function jstYmdToParts(ymd) {
  const [y, m, d] = String(ymd || '').split('-').map((x) => Number(x));
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/**
 * JSTの「年月日+時分秒」を UTC ISO に変換する。
 * 例: 2026-02-10 06:00 JST -> 2026-02-09T21:00:00.000Z
 */
function jstDateTimeToUtcIso(ymd, hour = 0, minute = 0, second = 0) {
  const parts = jstYmdToParts(ymd);
  if (!parts) return null;
  const { y, m, d } = parts;
  const utcMs = Date.UTC(y, m - 1, d, Number(hour) - 9, Number(minute), Number(second));
  return new Date(utcMs).toISOString();
}


module.exports = {
  JST_TZ,
  formatJstYmd,
  formatJstHm,
  getJstHour,
  jstDateTimeToUtcIso,
};
