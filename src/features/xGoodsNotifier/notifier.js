// src/features/xGoodsNotifier/notifier.js
// X の「本日締切グッズまとめ」投稿を検出して Discord へ通知（読取最小化）

const { EmbedBuilder } = require('discord.js');

const { getXGoodsNotifierConfig } = require('./config');
const { getState, setLastNotified, setUserIdCache, setLastFetch } = require('./stateStore');
const { isTargetTweetText } = require('./matcher');
const { formatJstYmd, formatJstHm, getJstHour, jstDateTimeToUtcIso } = require('./time');
const { getUserIdByUsername, getLatestTweetsByUserId } = require('./xApi');

function safeLogError(prefix, err) {
  const info = {
    message: err?.message,
    code: err?.code,
    status: err?.status,
  };
  if (err?.data) {
    info.data = typeof err.data === 'string' ? err.data.slice(0, 200) : err.data;
  }
  console.error(prefix, info);
}

function buildTweetUrl(username, tweetId) {
  return `https://x.com/${username}/status/${tweetId}`;
}

function pickCandidateTweet(tweets, cfg, todayJstYmd) {
  for (const t of tweets || []) {
    const created = t?.created_at ? new Date(t.created_at) : null;
    if (!created) continue;

    // JST日付が「今日」
    const ymd = formatJstYmd(created);
    if (ymd !== todayJstYmd) continue;

    // JST時刻がウィンドウ内
    const hour = getJstHour(created);
    if (Number.isFinite(cfg.minHourJst) && hour < cfg.minHourJst) continue;
    if (Number.isFinite(cfg.maxHourJst) && hour > cfg.maxHourJst) continue;

    // テキスト条件
    if (!isTargetTweetText(t.text, cfg)) continue;

    return {
      tweet: t,
      jstYmd: ymd,
      jstHm: formatJstHm(created),
    };
  }
  return null;
}

async function runXGoodsNotifier(client, { force = false, reason = 'cron' } = {}) {
  // TDZ 回避のため先に初期化
  const todayJstYmd = formatJstYmd(new Date());

  const cfg = getXGoodsNotifierConfig();
  const state = getState();

  const enabled = state.enabled === null ? cfg.enabledDefault : !!state.enabled;
  const meta = {
    reason,
    force,
    todayJstYmd,
    windowJst: `${cfg.minHourJst}:00-${cfg.maxHourJst}:59`,
    maxResults: cfg.maxResults,
  };

  // 「cronが動いてるのにログが無い」対策
  console.log('[xGoodsNotifier] run start', meta);

  try {
    if (!enabled && !force) {
      const res = { ok: true, skipped: true, why: 'disabled', ...meta };
      setLastFetch(todayJstYmd, res);
      return res;
    }

    if (!cfg.channelId) {
      const res = { ok: false, skipped: true, why: 'missing_channel_id', ...meta };
      setLastFetch(todayJstYmd, res);
      return res;
    }

    const token = process.env.X_BEARER_TOKEN || process.env.X_BEARER || process.env.TWITTER_BEARER_TOKEN;
    if (!token) {
      const res = { ok: false, skipped: true, why: 'missing_x_bearer_token', ...meta };
      setLastFetch(todayJstYmd, res);
      return res;
    }

    // すでに今日通知済みなら、読みに行かず終了（forceなら読む）
    if (!force && state.lastNotifiedJstYmd === todayJstYmd) {
      const res = {
        ok: true,
        skipped: true,
        why: 'already_notified_today_no_fetch',
        tweetId: state.lastNotifiedTweetId || null,
        ...meta,
      };
      setLastFetch(todayJstYmd, res);
      console.log('[xGoodsNotifier] skipped (already notified today)', meta);
      return res;
    }

    // 連打対策：直近結果があれば 2分はキャッシュで返す（読取最小化）
    const ttlMs = 2 * 60 * 1000;
    if (!force && state.lastFetchAtIso && state.lastFetchJstYmd === todayJstYmd && state.lastFetchResult) {
      const age = Date.now() - Date.parse(state.lastFetchAtIso);
      if (Number.isFinite(age) && age >= 0 && age < ttlMs) {
        const res = { ...state.lastFetchResult, cached: true };
        console.log('[xGoodsNotifier] return cached result', { ...meta, ageMs: age });
        return res;
      }
    }

    // userId を 1回だけ引いてキャッシュ
    const username = cfg.username;
    let userId = state.userIdCache;
    if (!userId) {
      userId = await getUserIdByUsername(username, token);
      setUserIdCache(userId);
      console.log('[xGoodsNotifier] resolved userId', { ...meta, userId });
    }

    // ===== X API 読取最小化 =====
    // JST 06:00〜08:59 のみ（6:30投稿 + 遅延も吸収）
    const minHour = Number.isFinite(cfg.minHourJst) ? cfg.minHourJst : 6;
    const maxHour = Number.isFinite(cfg.maxHourJst) ? cfg.maxHourJst : 8;

    const startTimeIso = jstDateTimeToUtcIso(todayJstYmd, minHour, 0, 0);
    const endTimeIso = jstDateTimeToUtcIso(todayJstYmd, maxHour + 1, 0, 0); // end_time は未満

    const maxResults = Number.isFinite(cfg.maxResults) ? cfg.maxResults : 5;
    const sinceId = !force && state.lastNotifiedTweetId ? String(state.lastNotifiedTweetId) : null;

    console.log('[xGoodsNotifier] fetching tweets', { ...meta, startTimeIso, endTimeIso, sinceId });

    const tweets = await getLatestTweetsByUserId(userId, token, {
      maxResults,
      startTimeIso,
      endTimeIso,
      sinceId,
      exclude: 'retweets',
    });

    console.log('[xGoodsNotifier] fetched tweets', { ...meta, count: Array.isArray(tweets) ? tweets.length : 0 });

    const cand = pickCandidateTweet(tweets, cfg, todayJstYmd);
    if (!cand) {
      const res = { ok: true, skipped: true, why: 'no_candidate', fetched: tweets?.length || 0, ...meta };
      setLastFetch(todayJstYmd, res);
      console.log('[xGoodsNotifier] no candidate', res);
      return res;
    }

    const tweetId = cand.tweet.id;
    if (!tweetId) {
      const res = { ok: true, skipped: true, why: 'candidate_missing_id', ...meta };
      setLastFetch(todayJstYmd, res);
      return res;
    }

    // 同じIDを二重通知しない
    if (state.lastNotifiedTweetId === String(tweetId)) {
      const res = { ok: true, skipped: true, why: 'already_notified_same_tweet', tweetId, ...meta };
      setLastFetch(todayJstYmd, res);
      return res;
    }

    const channel = await client.channels.fetch(cfg.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      const res = { ok: false, skipped: true, why: 'channel_not_found', ...meta };
      setLastFetch(todayJstYmd, res);
      return res;
    }

    const tweetUrl = buildTweetUrl(username, tweetId);

    const embed = new EmbedBuilder()
      .setTitle(`本日締切グッズまとめ（${cand.jstYmd} ${cand.jstHm}頃）`)
      .setURL(tweetUrl)
      .setDescription(String(cand.tweet.text || '').slice(0, 3900))
      .setFooter({ text: `source: @${username} / ${reason}` });

    await channel.send({
      content: `📦 **本日締切グッズまとめ**\n${tweetUrl}`,
      embeds: [embed],
      allowedMentions: { parse: [] },
    });

    setLastNotified(tweetId, cand.jstYmd);

    const res = { ok: true, notified: true, tweetId: String(tweetId), tweetUrl, ...meta };
    setLastFetch(todayJstYmd, res);

    console.log('[xGoodsNotifier] notified', res);
    return res;
  } catch (e) {
    safeLogError('[xGoodsNotifier] run error:', e);
    const res = { ok: false, error: true, message: e?.message, ...meta };
    // ここで stateStore が落ちても notifier は落とさない
    try { setLastFetch(todayJstYmd, res); } catch {}
    return res;
  }
}

module.exports = { runXGoodsNotifier };
