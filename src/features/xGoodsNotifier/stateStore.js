// src/features/xGoodsNotifier/stateStore.js
// on/off 状態や「最後に通知した投稿ID」などを最小限だけローカルに保持
// ※Render では永続ではない可能性があるため、
//   - その場合でも「同一プロセス内の重複通知」を防ぐ
//   - 再起動後に同日もう一度通知される可能性はゼロにはできない（許容）

const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(process.cwd(), 'data', 'xGoodsNotifierState.json');

let _cache = null;

function defaultState() {
  return {
    enabled: null, // null のときは config の enabledDefault を採用
    lastNotifiedTweetId: null,
    lastNotifiedJstYmd: null,
    userIdCache: null, // username -> userId を1回だけ引くため
    lastFetchAtIso: null,
    lastFetchJstYmd: null,
    lastFetchResult: null,
  };
}

function readStateFile() {
  try {
    if (!fs.existsSync(STATE_PATH)) return defaultState();
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const obj = JSON.parse(raw);
    return { ...defaultState(), ...obj };
  } catch (e) {
    console.error('[xGoodsNotifier] state read error:', e);
    return defaultState();
  }
}

function writeStateFile(next) {
  try {
    const dir = path.dirname(STATE_PATH);
    fs.mkdirSync(dir, { recursive: true });

    const tmp = `${STATE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(tmp, STATE_PATH);
  } catch (e) {
    console.error('[xGoodsNotifier] state write error:', e);
  }
}

function getState() {
  if (_cache) return _cache;
  _cache = readStateFile();
  return _cache;
}

function setState(patch) {
  const cur = getState();
  const next = { ...cur, ...patch };
  _cache = next;
  writeStateFile(next);
  return next;
}

function setEnabled(enabled) {
  return setState({ enabled: !!enabled });
}

function setLastNotified(tweetId, jstYmd) {
  return setState({ lastNotifiedTweetId: String(tweetId), lastNotifiedJstYmd: String(jstYmd) });
}


function setLastFetch(jstYmd, result) {
  try {
    return setState({
      lastFetchAtIso: new Date().toISOString(),
      lastFetchJstYmd: jstYmd ? String(jstYmd) : null,
      lastFetchResult: result ?? null,
    });
  } catch {
    // noop
    return null;
  }
}

function setUserIdCache(userId) {
  return setState({ userIdCache: String(userId) });
}

module.exports = {
  getState,
  setState,
  setEnabled,
  setLastNotified,
  setUserIdCache,
  setLastFetch,
  STATE_PATH,
};
