// src/features/xGoodsNotifier/notifier.js
// X(旧Twitter) の投稿を取得して Discord に通知

const { getXGoodsNotifierConfig } = require('./config');
const { isTargetTweetText } = require('./matcher');
const {
  getState,
  setLastNotified,
  setLastNotifiedYmd,
  setLastFetchAt,
  setLastFetchYmd,
  setLastFetchResult,
} = require('./stateStore');
const { getLatestTweetsByUserId } = require('./xApi');
const { formatJstYmd, formatJstHm, jstDateTimeToUtcIso } = require('./time');

function pickCandidateTweet(tweets, cfg, todayJstYmd) {
  if (!Array.isArray(tweets) || tweets.length === 0) return null;

  for (const t of tweets) {
    if (!t || !t.text || !t.created_at) continue;

    // テキスト判定
    if (!isTargetTweetText(t.text, cfg)) continue;

    // JST の「日付」が今日か
    const created = new Date(t.created_at);
    const ymd = formatJstYmd(created);
    if (ymd !== todayJstYmd) continue;

    return t;
  }

  return null;
}

async function sendDiscordNotification(client, channelId, message) {
  if (!channelId) throw new Error('channelId is not set');
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) throw new Error('channel not found or not text-based');
  await channel.send({ content: message, allowedMentions: { parse: [] } });
}

async function runXGoodsNotifier(client, { force = false, reason = 'unknown' } = {}) {
  const cfg = getXGoodsNotifierConfig();
  const st = getState();

  const enabled = st.enabled === null ? cfg.enabledDefault : !!st.enabled;
  const todayJstYmd = formatJstYmd(new Date());

  const meta = {
    reason,
    force,
    todayJstYmd,
    windowJst: `${cfg.minHourJst}:00-${cfg.maxHourJst}:59`,
    maxResults: cfg.maxResults,
  };

  // ここでログを出しておくと「cron が動いてるのにログが無い」状態を避けられる
  console.log('[xGoodsNotifier] run start', meta);

  if (!enabled) {
    const res = { ok: true, skipped: true, why: 'disabled' };
    setLastFetchAt(new Date().toISOString());
    setLastFetchYmd(todayJstYmd);
    setLastFetchResult({ ...res, ...meta });
    console.log('[xGoodsNotifier] skipped (disabled)', meta);
    return res;
  }

  if (!force && st.lastNotifiedJstYmd === todayJstYmd) {
    const res = { ok: true, skipped: true, why: 'already_notified_today_no_fetch' };
    setLastFetchAt(new Date().toISOString());
    setLastFetchYmd(todayJstYmd);
    setLastFetchResult({ ...res, ...meta });
    console.log('[xGoodsNotifier] skipped (already notified today)', meta);
    return res;
  }

  // X API 読み取りを最小化するため、1回の呼び出しで完結させる
  const startTimeIso = jstDateTimeToUtcIso(todayJstYmd, cfg.minHourJst, 0, 0);
  const endTimeIso = jstDateTimeToUtcIso(todayJstYmd, cfg.maxHourJst + 1, 0, 0);

  try {
    const tweets = await getLatestTweetsByUserId(cfg.userId, {
      bearerToken: cfg.bearerToken,
      maxResults: cfg.maxResults,
      startTimeIso,
      endTimeIso,
    });

    console.log('[xGoodsNotifier] fetched tweets', {
      ...meta,
      count: Array.isArray(tweets) ? tweets.length : 0,
      startTimeIso,
      endTimeIso,
    });

    setLastFetchAt(new Date().toISOString());
    setLastFetchYmd(todayJstYmd);

    const candidate = pickCandidateTweet(tweets, cfg, todayJstYmd);

    if (!candidate) {
      const res = {
        ok: true,
        skipped: true,
        why: 'no_candidate',
        fetched: Array.isArray(tweets) ? tweets.length : 0,
      };
      setLastFetchResult({ ...res, ...meta });
      console.log('[xGoodsNotifier] no candidate', { ...meta, fetched: res.fetched });
      return res;
    }

    const tweetId = candidate.id;
    const tweetUrl = `https://x.com/${cfg.username}/status/${tweetId}`;

    // 二重投稿抑止
    if (!force && st.lastNotifiedTweetId === tweetId) {
      const res = { ok: true, skipped: true, why: 'already_notified_same_tweet', tweetId, tweetUrl };
      setLastFetchResult({ ...res, ...meta });
      console.log('[xGoodsNotifier] skipped (already notified same tweet)', { ...meta, tweetId });
      return res;
    }

    const message = `📌 **本日締め切りグッズまとめ（${formatJstHm(new Date())} JST）**\n${tweetUrl}`;

    await sendDiscordNotification(client, cfg.channelId, message);

    setLastNotified(tweetId);
    setLastNotifiedYmd(todayJstYmd);

    const res = { ok: true, notified: true, tweetId, tweetUrl };
    setLastFetchResult({ ...res, ...meta });

    console.log('[xGoodsNotifier] notified', { ...meta, tweetId, tweetUrl });
    return res;
  } catch (e) {
    const res = {
      ok: false,
      error: true,
      message: e?.message || String(e),
      code: e?.code,
      status: e?.status,
    };
    setLastFetchAt(new Date().toISOString());
    setLastFetchYmd(todayJstYmd);
    setLastFetchResult({ ...res, ...meta });
    console.log('[xGoodsNotifier] run error', res);
    return res;
  }
}

module.exports = { runXGoodsNotifier };
