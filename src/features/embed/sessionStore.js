const DEFAULT_TTL_MS = 60 * 60 * 1000; // 60分
const CLEAN_INTERVAL_MS = 5 * 60 * 1000;

const sessions = new Map();
let lastCleanAt = 0;

function now() {
  return Date.now();
}

function keyOf({ guildId, channelId, userId }) {
  // guildId が null（DM等）の可能性もあるので安全に
  return `${guildId || 'dm'}:${channelId || 'dm'}:${userId}`;
}

function cleanIfNeeded() {
  const t = now();
  if (t - lastCleanAt < CLEAN_INTERVAL_MS) return;
  lastCleanAt = t;

  for (const [k, s] of sessions.entries()) {
    if (!s) {
      sessions.delete(k);
      continue;
    }
    if (t - s.updatedAt > s.ttlMs) sessions.delete(k);
  }
}

function createDefaultDraft({ targetChannelId = null } = {}) {
  return {
    title: '',
    description: '',
    color: null, // number|null
    timestamp: false,

    // /embed の送信先（未指定時は実行チャンネル）
    targetChannelId: targetChannelId || null,

    authorName: '',
    authorIconUrl: '',
    authorUrl: '',

    thumbnailUrl: '',
    imageUrl: '',

    footerText: '',
    footerIconUrl: '',

    fields: [], // { name, value, inline }

    appendUrlsText: '',

    linkButtons: [], // { label, url }
    selectMenu: null, // { placeholder, options: [{ label, value, description, emoji }] }
  };
}

/**
 * @param {string|null} guildId
 * @param {string|null} channelId
 * @param {string} userId
 * @param {number} [ttlMs]
 */
function getOrCreateSession(guildId, channelId, userId, ttlMs = DEFAULT_TTL_MS) {
  cleanIfNeeded();

  const k = keyOf({ guildId, channelId, userId });
  const t = now();

  const prev = sessions.get(k);
  if (prev && t - prev.updatedAt <= prev.ttlMs) {
    prev.updatedAt = t;
    return prev;
  }

  const s = {
    key: k,
    createdAt: t,
    updatedAt: t,
    ttlMs,
    cooldownUntil: 0,
    draft: createDefaultDraft({ targetChannelId: channelId || null }),
  };

  sessions.set(k, s);
  return s;
}

function updateDraft(session, patch) {
  if (!session) return;
  session.draft = { ...session.draft, ...patch };
  session.updatedAt = now();
}

function resetDraft(session) {
  if (!session) return;
  const keepTarget = session.draft?.targetChannelId || null;
  session.draft = createDefaultDraft({ targetChannelId: keepTarget });
  session.updatedAt = now();
}

function deleteSession(guildId, channelId, userId) {
  const k = keyOf({ guildId, channelId, userId });
  sessions.delete(k);
}

module.exports = {
  getOrCreateSession,
  updateDraft,
  resetDraft,
  deleteSession,
};
