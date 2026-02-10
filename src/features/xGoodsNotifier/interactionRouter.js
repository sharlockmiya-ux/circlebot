// src/features/xGoodsNotifier/interactionRouter.js
// /xgoods コマンドで on/off と手動テスト

const { PermissionFlagsBits, MessageFlags } = require('discord.js');

const { getXGoodsNotifierConfig } = require('./config');
const { getState, setEnabled, STATE_PATH } = require('./stateStore');
const { runXGoodsNotifier } = require('./notifier');

const EPHEMERAL = { flags: MessageFlags.Ephemeral };

function hasManageGuild(interaction) {
  try {
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || false;
  } catch {
    return false;
  }
}

function stripEphemeral(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const { flags, ephemeral, ...rest } = payload;
  return rest;
}

async function safeEditOrFollowUp(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(stripEphemeral(payload));
    }
    return await interaction.reply({ ...payload, ...EPHEMERAL });
  } catch (e) {
    // 10062 (Unknown interaction) などは、ユーザー側には「考え中」で残らないよう握り潰す
    const code = e?.code;
    if (code === 10062) return;
    try {
      return await interaction.followUp({ ...payload, ...EPHEMERAL });
    } catch {
      return;
    }
  }
}

async function ensureDeferred(interaction) {
  if (interaction.deferred || interaction.replied) return;
  try {
    await interaction.deferReply({ ...EPHEMERAL });
  } catch (e) {
    // 10062 等はここで出ることがある
    const code = e?.code;
    if (code === 10062) return;
    throw e;
  }
}

function formatStatus() {
  const cfg = getXGoodsNotifierConfig();
  const st = getState();
  const enabled = st.enabled === null ? cfg.enabledDefault : !!st.enabled;

  return {
    enabled,
    channelId: cfg.channelId,
    username: cfg.username,
    lastNotifiedTweetId: st.lastNotifiedTweetId,
    lastNotifiedJstYmd: st.lastNotifiedJstYmd,
    lastFetchAtIso: st.lastFetchAtIso,
    lastFetchJstYmd: st.lastFetchJstYmd,
    lastFetchResult: st.lastFetchResult,
    statePath: STATE_PATH,
  };
}

function who(interaction) {
  const u = interaction.user;
  return u ? `${u.username}(${u.id})` : 'unknown';
}

async function handleXGoodsSlash(interaction) {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'xgoods') return;

  const sub = interaction.options.getSubcommand();

  // Render 側で「コマンドが呼ばれたか」を確認できるようにログ
  console.log(`[Slash] /xgoods ${sub} from ${who(interaction)}`);

  if (sub === 'status') {
    const st = formatStatus();
    await safeEditOrFollowUp(interaction, {
      content:
        `**xGoods notifier**\n` +
        `- enabled: **${st.enabled ? 'ON' : 'OFF'}**\n` +
        `- username: @${st.username}\n` +
        `- channelId: ${st.channelId || '(unset)'}\n` +
        `- lastNotified: ${st.lastNotifiedJstYmd || '-'} / ${st.lastNotifiedTweetId || '-'}\n` +
        `- lastFetch: ${st.lastFetchJstYmd || '-'} / ${st.lastFetchAtIso || '-'}\n` +
        `- state: ${st.statePath}`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // ここから先は運営向け
  if (!hasManageGuild(interaction)) {
    await safeEditOrFollowUp(interaction, {
      content: 'この操作には Manage Server 権限が必要です。',
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (sub === 'on') {
    setEnabled(true);
    const after = formatStatus();
    await safeEditOrFollowUp(interaction, {
      content: `✅ xGoods notifier を **ON** にしました（channel: ${after.channelId || '(unset)'}）`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (sub === 'off') {
    setEnabled(false);
    await safeEditOrFollowUp(interaction, {
      content: '🛑 xGoods notifier を **OFF** にしました。',
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (sub === 'test') {
    await ensureDeferred(interaction);

    let result;
    try {
      result = await runXGoodsNotifier(interaction.client, { force: false, reason: 'manual_test' });
    } catch (e) {
      result = { ok: false, error: true, message: e?.message || String(e) };
    }

    if (result?.notified) {
      await safeEditOrFollowUp(interaction, {
        content: `✅ テスト通知しました: ${result.tweetUrl}`,
        allowedMentions: { parse: [] },
      });
    } else {
      await safeEditOrFollowUp(interaction, {
        content: `ℹ️ テスト結果: ${JSON.stringify(result)}`,
        allowedMentions: { parse: [] },
      });
    }

    console.log('[xGoodsNotifier] manual_test result', result);
    return;
  }
}

async function handleXGoodsInteraction(interaction) {
  await handleXGoodsSlash(interaction);
}

module.exports = { handleXGoodsInteraction };
