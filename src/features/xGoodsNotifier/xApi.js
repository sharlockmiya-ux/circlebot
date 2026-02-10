// src/features/xGoodsNotifier/xApi.js
// X API v2 への最小ラッパー（Bearer Tokenでの読み取り）

const DEFAULT_TIMEOUT_MS = 12_000;

async function xFetchJson(url, bearerToken, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!bearerToken) {
    const err = new Error('Missing X bearer token');
    err.code = 'NO_TOKEN';
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'User-Agent': 'CircleBot-xGoodsNotifier/1.0',
      },
      signal: controller.signal,
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const err = new Error(`X API error: ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function getUserIdByUsername(username, bearerToken) {
  const url = `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`;
  const data = await xFetchJson(url, bearerToken);
  const id = data?.data?.id;
  if (!id) {
    const err = new Error('Could not resolve user id');
    err.code = 'NO_USER_ID';
    err.data = data;
    throw err;
  }
  return id;
}

async function getLatestTweetsByUserId(userId, bearerToken, { maxResults = 10 } = {}) {
  // created_at と text だけで十分
  const params = new URLSearchParams({
    'tweet.fields': 'created_at,text',
    exclude: 'replies,retweets',
    max_results: String(Math.max(5, Math.min(100, maxResults))),
  });
  const url = `https://api.x.com/2/users/${encodeURIComponent(userId)}/tweets?${params.toString()}`;
  const data = await xFetchJson(url, bearerToken);
  return data?.data || [];
}

module.exports = {
  xFetchJson,
  getUserIdByUsername,
  getLatestTweetsByUserId,
};
