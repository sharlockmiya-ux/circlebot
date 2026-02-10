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

function pickCandidateTweet(tweets, cfg, todayJstYmd) {
  // 「今日」「6:30前後」かつ本文が条件に合うものを上から探す
  for (const t of tweets || []) {
    const created = t?.created_at ? new Date(t.created_at) : null;
    if (!created) continue;

    const ymd = formatJstYmd(created);
    if (ymd !== todayJstYmd) continue;

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
  // NOTE:
  // - 「today」を const で後ろで宣言すると TDZ で落ちるパターンがあるため
  //   先に必ず初期化しておく（Cannot access 'today' before initialization 対策）
  const todayJstYmd = formatJstYmd(new Date());

  try {
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

    // すでに今日通知済みなら、無駄な読み取りを避けて即スキップ（force の時だけ読みに行く）
    if (!force && state.lastNotifiedJstYmd === todayJstYmd) {
      const result = {
        ok: true,
        skipped: true,
        why: 'already_notified_today_no_fetch',
        tweetId: state.lastNotifiedTweetId || null,
      };
      setLastFetch(todayJstYmd, result);
      return result;
    }

    // 連打対策：直近の結果があれば短時間はキャッシュで返す（読取を最小化）
    const ttlMs = 2 * 60 * 1000;
    if (!force && state.lastFetchAtIso && state.lastFetchJstYmd === todayJstYmd && state.lastFetchResult) {
      const age = Date.now() - Date.parse(state.lastFetchAtIso);
      if (Number.isFinite(age) && age >= 0 && age < ttlMs) {
        return { ...state.lastFetchResult, cached: true };
      }
    }

    const username = cfg.username;
    let userId = state.userIdCache;
    if (!userId) {
      userId = await getUserIdByUsername(username, token);
      setUserIdCache(userId);
    }

    // ===== X API 読取最小化 =====
    // - JST 06:00〜07:59 あたりだけを狙い撃ち（6:30ツイート想定）
    // - maxResults は API の最小 5
    const minHour = Number.isFinite(cfg.minHourJst) ? cfg.minHourJst : 6;
    const maxHour = Number.isFinite(cfg.maxHourJst) ? cfg.maxHourJst : 7;

    const startTimeIso = jstDateTimeToUtcIso(todayJstYmd, minHour, 0, 0);
    // end_time は「未満」なので、maxHour+1 の 00:00 を指定
    const endTimeIso = jstDateTimeToUtcIso(todayJstYmd, maxHour + 1, 0, 0);

    const maxResults = Number.isFinite(cfg.maxResults) ? cfg.maxResults : 5;
    const sinceId = !force && state.lastNotifiedTweetId ? String(state.lastNotifiedTweetId) : null;

    const tweets = await getLatestTweetsByUserId(userId, token, {
      maxResults,
      startTimeIso,
      endTimeIso,
      sinceId,
      exclude: 'retweets',
    });

    const cand = pickCandidateTweet(tweets, cfg, todayJstYmd);
    if (!cand) {
      const result = { ok: true, skipped: true, why: 'no_candidate' };
      setLastFetch(todayJstYmd, result);
      return result;
    }

    const tweetId = cand.tweet.id;
    if (!tweetId) {
      const result = { ok: true, skipped: true, why: 'candidate_missing_id' };
      setLastFetch(todayJstYmd, result);
      return result;
    }

    // 同じIDを二重通知しない
    if (state.lastNotifiedTweetId === String(tweetId)) {
      const result = { ok: true, skipped: true, why: 'already_notified', tweetId };
      setLastFetch(todayJstYmd, result);
      return result;
    }

    // 同日内の再送も基本は避ける（force の時は許可）
    if (!force && state.lastNotifiedJstYmd === todayJstYmd) {
      const result = { ok: true, skipped: true, why: 'already_notified_today', tweetId };
      setLastFetch(todayJstYmd, result);
      return result;
    }

    const channel = await client.channels.fetch(cfg.channelId).catch(() => null);
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
    setLastFetch(todayJstYmd, result);
    return result;
  } catch (e) {
    safeLogError('[xGoodsNotifier] run error:', e);
    const result = { ok: false, error: true, message: e?.message };
    // ここで todayJstYmd は必ず初期化済み
    setLastFetch(todayJstYmd, result);
    return result;
  }
}

module.exports = { runXGoodsNotifier };
