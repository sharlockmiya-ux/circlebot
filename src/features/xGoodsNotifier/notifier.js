// src/features/xGoodsNotifier/notifier.js
// X の「本日締切グッズまとめ」投稿を検出して Discord へ通知

const { EmbedBuilder } = require('discord.js');

const { getXGoodsNotifierConfig } = require('./config');
const { getState, setLastNotified, setUserIdCache } = require('./stateStore');
const { isTargetTweetText } = require('./matcher');
const { formatJstYmd, formatJstHm, getJstHour } = require('./time');
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

  const username = cfg.username;
  let userId = state.userIdCache;
  try {
    if (!userId) {
      userId = await getUserIdByUsername(username, token);
      setUserIdCache(userId);
    }

    const tweets = await getLatestTweetsByUserId(userId, token, { maxResults: 10 });
    const cand = pickCandidateTweet(tweets, cfg);
    if (!cand) {
      return { ok: true, skipped: true, why: 'no_candidate' };
    }

    const tweetId = cand.tweet.id;
    if (!tweetId) {
      return { ok: true, skipped: true, why: 'candidate_missing_id' };
    }

    // 同じIDを二重通知しない
    if (state.lastNotifiedTweetId === String(tweetId)) {
      return { ok: true, skipped: true, why: 'already_notified', tweetId };
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
    return { ok: true, notified: true, tweetId, tweetUrl };
  } catch (e) {
    safeLogError('[xGoodsNotifier] run error:', e);
    return { ok: false, error: true, message: e?.message };
  }
}

module.exports = { runXGoodsNotifier };