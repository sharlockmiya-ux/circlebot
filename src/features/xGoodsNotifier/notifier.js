// src/features/xGoodsNotifier/notifier.js
// X の「本日締切グッズまとめ」投稿を検出して Discord へ通知

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
  // X API のレスポンス本文は長いことがあるので、最小限だけ
  if (err?.data) {
    info.data = typeof err.data === 'string' ? err.data.slice(0, 200) : err.data;
  }
  console.error(prefix, info);
}

function buildTweetUrl(username, tweetId) {
  return `https://x.com/${username}/status/${tweetId}`;
}

function pickCandidateTweet(tweets, cfg) {
  const today = formatJstYmd(new Date());

  // 「今日」「6:30前後」かつ本文が条件に合うものを上から探す
  for (const t of tweets) {
    const created = t?.created_at ? new Date(t.created_at) : null;
    if (!created) continue;

    const ymd = formatJstYmd(created);
    if (ymd !== today) continue;

    const hour = getJstHour(created);
    if (Number.isFinite(cfg.minHourJst) && hour < cfg.minHourJst) continue;
    if (Number.isFinite(cfg.maxHourJst) && hour > cfg.maxHourJst) continue;

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
  const cfg = getXGoodsNotifierConfig();
  const state = getState();

  const enabled = state.enabled === null ? cfg.enabledDefault : !!state.enabled;
  if (!enabled && !force) {
    return { ok: true, skipped: true, why: 'disabled' };
  }

  const channelId = cfg.channelId;
  if (!channelId) {
    return { ok: false, skipped: true, why: 'missing_channel_id' };
  }

  const token = process.env.X_BEARER_TOKEN || process.env.X_BEARER || process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    return { ok: false, skipped: true, why: 'missing_x_bearer_token' };
  }

const today = formatJstYmd(new Date());

// すでに今日通知済みなら、無駄な読み取りを避けて即スキップ（force の時だけ読みに行く）
if (!force && state.lastNotifiedJstYmd === today) {
  const result = {
    ok: true,
    skipped: true,
    why: 'already_notified_today_no_fetch',
    tweetId: state.lastNotifiedTweetId || null,
  };
  setLastFetch(today, result);
  return result;
}

// 連打対策：直近の結果があれば短時間はキャッシュで返す（読取を最小化）
const ttlMs = 2 * 60 * 1000;
if (!force && state.lastFetchAtIso && state.lastFetchJstYmd === today && state.lastFetchResult) {
  const age = Date.now() - Date.parse(state.lastFetchAtIso);
  if (Number.isFinite(age) && age >= 0 && age < ttlMs) {
    return { ...state.lastFetchResult, cached: true };
  }
}

  const username = cfg.username;
  let userId = state.userIdCache;
  try {
    if (!userId) {
      userId = await getUserIdByUsername(username, token);
      setUserIdCache(userId);
    }

    const minHour = Number.isFinite(cfg.minHourJst) ? cfg.minHourJst : 5;
    const maxHour = Number.isFinite(cfg.maxHourJst) ? cfg.maxHourJst : 9;
    const startTimeIso = jstDateTimeToUtcIso(today, minHour, 0, 0);
    const endTimeIso = jstDateTimeToUtcIso(today, maxHour + 1, 0, 0);
    const maxResults = Number.isFinite(cfg.maxResults) ? cfg.maxResults : 10;
    const sinceId = !force && state.lastNotifiedTweetId ? String(state.lastNotifiedTweetId) : null;
    const tweets = await getLatestTweetsByUserId(userId, token, {
      maxResults,
      startTimeIso,
      endTimeIso,
      sinceId,
      exclude: 'retweets',
    });
    const cand = pickCandidateTweet(tweets, cfg);
    if (!cand) {
      const result = { ok: true, skipped: true, why: 'no_candidate' };
      setLastFetch(today, result);
      return result;
    }

    const tweetId = cand.tweet.id;
    if (!tweetId) {
      return { ok: true, skipped: true, why: 'candidate_missing_id' };
    }

    // 同じIDを二重通知しない
    if (state.lastNotifiedTweetId === String(tweetId)) {
      const result = { ok: true, skipped: true, why: 'already_notified', tweetId };
      setLastFetch(today, result);
      return result;
    }

    // 同日内の再送も基本は避ける（force の時は許可）
    const today = formatJstYmd(new Date());
    if (!force && state.lastNotifiedJstYmd === today) {
      return { ok: true, skipped: true, why: 'already_notified_today', tweetId };
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return { ok: false, skipped: true, why: 'channel_not_found' };
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
    const result = { ok: true, notified: true, tweetId, tweetUrl };
    setLastFetch(today, result);
    return result;
  } catch (e) {
    safeLogError('[xGoodsNotifier] run error:', e);
    const result = { ok: false, error: true, message: e?.message };
    setLastFetch(today, result);
    return result;
  }
}

module.exports = { runXGoodsNotifier };