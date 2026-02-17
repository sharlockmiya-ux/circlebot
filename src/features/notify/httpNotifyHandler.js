const { URL } = require('url');
const { EmbedBuilder, GatewayIntentBits } = require('discord.js');

const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_NOTIFY_CHANNEL_ID = '1432388076256231516';
const DEFAULT_MEMBER_LIMIT = 10;

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function getHeaderValue(req, key) {
  const raw = req.headers[key];
  if (Array.isArray(raw)) return String(raw[0] || '');
  return String(raw || '');
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;

    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

async function readJsonBody(req) {
  const rawBody = await readRequestBody(req, MAX_BODY_BYTES);
  if (!rawBody) return {};
  return JSON.parse(rawBody);
}

function resolveSecret(req, url, payload) {
  return String(
    getHeaderValue(req, 'x-notify-secret')
    || payload?.secret
    || url.searchParams.get('secret')
    || '',
  );
}

function verifySecret(expectedSecret, providedSecret) {
  if (!expectedSecret) return { ok: true };
  if (!providedSecret) return { ok: false, status: 401, error: 'missing_secret' };
  if (providedSecret !== expectedSecret) return { ok: false, status: 403, error: 'invalid_secret' };
  return { ok: true };
}

function hasGuildMembersIntent(client) {
  try {
    const intents = client?.options?.intents;
    if (!intents || typeof intents.has !== 'function') return true;
    return intents.has(GatewayIntentBits.GuildMembers);
  } catch (_) {
    return true;
  }
}

async function getGuild(client, guildId) {
  if (!client || !client.user || !guildId) return null;
  const cached = client.guilds.cache.get(guildId);
  if (cached) return cached;
  try {
    return await client.guilds.fetch(guildId);
  } catch (err) {
    console.error('[notify] guild fetch failed:', err);
    return null;
  }
}

async function verifyGuildMember(guild, userId) {
  if (!userId) return { ok: true };
  try {
    await guild.members.fetch({ user: userId, force: true });
    return { ok: true };
  } catch (err) {
    const code = Number(err?.code || 0);
    if (code === 10007) {
      return { ok: false, status: 403, error: 'not_guild_member' };
    }
    console.error('[notify] member verify failed:', err);
    return { ok: false, status: 503, error: 'member_verify_unavailable' };
  }
}

function mapMember(member) {
  const user = member?.user;
  const displayName = member?.displayName || user?.globalName || user?.username || '';
  return {
    id: String(user?.id || ''),
    displayName: String(displayName),
    username: String(user?.username || ''),
  };
}

function buildNotifyEmbed(payload) {
  const title = payload?.title || '✅ スクショ完了';
  const mentionText = payload?.mentionUserId ? `<@${payload.mentionUserId}> ` : '';
  const description = payload?.description
    || `${mentionText}botが作業を終了しました`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x2d8cff)
    .setTimestamp();

  const fields = [];
  if (Number.isFinite(payload?.shots)) fields.push({ name: 'shots', value: String(payload.shots), inline: true });
  if (Number.isFinite(payload?.maxShots)) fields.push({ name: 'maxShots', value: String(payload.maxShots), inline: true });
  if (payload?.templatePack) fields.push({ name: 'templatePack', value: String(payload.templatePack), inline: true });
  if (payload?.outputDir) fields.push({ name: 'outputDir', value: String(payload.outputDir), inline: false });
  if (payload?.savedTo) fields.push({ name: 'savedTo', value: String(payload.savedTo), inline: false });
  if (payload?.startedAt) fields.push({ name: 'startedAt', value: String(payload.startedAt), inline: true });
  if (payload?.finishedAt) fields.push({ name: 'finishedAt', value: String(payload.finishedAt), inline: true });
  if (payload?.stopReason) fields.push({ name: 'stopReason', value: String(payload.stopReason), inline: true });
  if (fields.length) embed.addFields(fields);
  return embed;
}

function createNotifyHandler(options = {}) {
  const getClient = options.getClient || (() => null);
  const getNotifySecret = options.getNotifySecret || (() => '');
  const getGuildId = options.getGuildId || (() => '');
  const getNotifyChannelId = options.getNotifyChannelId || (() => '');

  return async function notifyHandler(req, res) {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;
    const isMembersRoute = pathname === '/api/members' || pathname === '/notify/members';
    const isNotifyRoute = pathname === '/api/notify' || pathname === '/notify';
    if (!isMembersRoute && !isNotifyRoute) {
      writeJson(res, 404, { ok: false, reason: 'not_found' });
      return;
    }

    const expectedSecret = String(getNotifySecret() || '').trim();
    const providedSecret = resolveSecret(req, url, null);
    const secretCheck = verifySecret(expectedSecret, providedSecret);
    if (!secretCheck.ok) {
      writeJson(res, secretCheck.status, { ok: false, reason: secretCheck.error });
      return;
    }

    const client = getClient();
    const guildId = String(getGuildId() || '').trim();
    if (!client || !client.user || !guildId) {
      writeJson(res, 503, { ok: false, reason: 'client_or_guild_unavailable' });
      return;
    }
    const guild = await getGuild(client, guildId);
    if (!guild) {
      writeJson(res, 503, { ok: false, reason: 'guild_unavailable' });
      return;
    }

    if (isMembersRoute) {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, reason: 'method_not_allowed', members: [] });
        return;
      }

      const query = String(url.searchParams.get('q') || url.searchParams.get('query') || '').trim();
      const requestedLimit = Number(url.searchParams.get('limit') || DEFAULT_MEMBER_LIMIT);
      const limit = Math.max(1, Math.min(DEFAULT_MEMBER_LIMIT, Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_MEMBER_LIMIT));

      if (query.length < 2) {
        writeJson(res, 200, { ok: true, members: [] });
        return;
      }

      if (!hasGuildMembersIntent(client)) {
        console.warn('[notify] GuildMembers intent is not enabled in bot runtime');
        writeJson(res, 200, { ok: false, reason: 'guild_members_intent_required', members: [] });
        return;
      }

      try {
        const members = await guild.members.search({ query, limit });
        const items = members
          .map(mapMember)
          .filter((m) => m.id)
          .slice(0, limit);
        writeJson(res, 200, { ok: true, members: items });
      } catch (err) {
        console.error('[notify] members search failed:', err);
        writeJson(res, 200, { ok: false, reason: 'members_search_failed', members: [] });
      }
      return;
    }

    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, reason: 'method_not_allowed' });
      return;
    }

    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (err) {
      const reason = err && err.message === 'payload_too_large'
        ? 'payload_too_large'
        : 'invalid_json';
      writeJson(res, 400, { ok: false, reason });
      return;
    }

    const providedSecretFromBody = resolveSecret(req, url, payload);
    const bodySecretCheck = verifySecret(expectedSecret, providedSecretFromBody);
    if (!bodySecretCheck.ok) {
      writeJson(res, bodySecretCheck.status, { ok: false, reason: bodySecretCheck.error });
      return;
    }

    const mentionUserId = String(payload?.mentionUserId || '').trim();
    if (mentionUserId) {
      const verify = await verifyGuildMember(guild, mentionUserId);
      if (!verify.ok) {
        writeJson(res, verify.status || 503, { ok: false, reason: verify.error || 'member_verify_failed' });
        return;
      }
    }

    const channelIdFromBody = String(payload?.channelId || '').trim();
    const notifyChannelId = channelIdFromBody || String(getNotifyChannelId() || DEFAULT_NOTIFY_CHANNEL_ID).trim();
    if (!notifyChannelId) {
      writeJson(res, 503, { ok: false, reason: 'notify_channel_missing' });
      return;
    }

    let channel;
    try {
      channel = await client.channels.fetch(notifyChannelId);
    } catch (err) {
      console.error('[notify] channel fetch failed:', err);
      writeJson(res, 503, { ok: false, reason: 'notify_channel_unavailable' });
      return;
    }

    if (!channel || !channel.isTextBased()) {
      writeJson(res, 503, { ok: false, reason: 'notify_channel_not_text' });
      return;
    }

    try {
      const content = mentionUserId ? `<@${mentionUserId}>` : '';
      const embed = buildNotifyEmbed({ ...payload, mentionUserId });
      const sent = await channel.send({
        content,
        embeds: [embed],
        allowedMentions: mentionUserId ? { users: [mentionUserId] } : { parse: [] },
      });
      console.log(`[notify] channel message sent ${sent.id} mention=${mentionUserId || 'none'}`);
      writeJson(res, 200, { ok: true, channelId: notifyChannelId, mentionUserId, messageId: sent.id });
    } catch (err) {
      console.error('[notify] channel send failed:', err);
      writeJson(res, 500, { ok: false, reason: 'channel_send_failed' });
    }
  };
}

module.exports = {
  createNotifyHandler,
};
