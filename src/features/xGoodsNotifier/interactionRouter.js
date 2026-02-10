// src/features/xGoodsNotifier/interactionRouter.js
// /xgoods コマンドで on/off と手動テスト

const { PermissionFlagsBits, MessageFlags } = require('discord.js');

const { getXGoodsNotifierConfig } = require('./config');
const { getState, setEnabled } = require('./stateStore');
const { runXGoodsNotifier } = require('./notifier');
const { STATE_PATH } = require('./stateStore');

function hasManageGuild(interaction) {
  try {
    return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || false;
  } catch {
    return false;
  }
}



const EPHEMERAL = { flags: MessageFlags.Ephemeral };

function stripEphemeral(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const { flags, ephemeral, ...rest } = payload;
  return rest;
}

async function replyEphemeral(interaction, payload) {
  const base = {
    allowedMentions: { parse: [] },
    ...payload,
  };

  if (interaction.deferred || interaction.replied) {
    // 既にACK済みなら defer/reply を重ねない（40060 回避）
    try {
      return await interaction.editReply(stripEphemeral(base));
    } catch {
      return await interaction.followUp({ ...base, ...EPHEMERAL });
    }
  }

  return await interaction.reply({ ...base, ...EPHEMERAL });
}

async function ensureDeferred(interaction) {
  if (interaction.deferred || interaction.replied) return;
  await interaction.deferReply({ ...EPHEMERAL });
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
    statePath: STATE_PATH,
  };
}

async function handleXGoodsSlash(interaction) {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'xgoods') return;

  const sub = interaction.options.getSubcommand();
  const st = formatStatus();

  if (sub === 'status') {
    await replyEphemeral(interaction, {
      content:
        `**xGoods notifier**\n` +
        `- enabled: **${st.enabled ? 'ON' : 'OFF'}**\n` +
        `- username: @${st.username}\n` +
        `- channelId: ${st.channelId || '(unset)'}\n` +
        `- last: ${st.lastNotifiedJstYmd || '-'} / ${st.lastNotifiedTweetId || '-'}\n` +
        `- state: ${st.statePath}`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // ここから先は運営向け
  if (!hasManageGuild(interaction)) {
    await replyEphemeral(interaction, {
      content: 'この操作には Manage Server 権限が必要です。',
    });
    return;
  }

  if (sub === 'on') {
    setEnabled(true);
    const after = formatStatus();
    await replyEphemeral(interaction, {
      content: `✅ xGoods notifier を **ON** にしました（channel: ${after.channelId || '(unset)'}）`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (sub === 'off') {
    setEnabled(false);
    await replyEphemeral(interaction, {
      content: '🛑 xGoods notifier を **OFF** にしました。',
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (sub === 'test') {
    await ensureDeferred(interaction);
    const result = await runXGoodsNotifier(interaction.client, { force: false, reason: 'manual_test' });
    if (result?.notified) {
      await interaction.editReply(`✅ テスト通知しました: ${result.tweetUrl}`);
    } else {
      await interaction.editReply(`ℹ️ テスト結果: ${JSON.stringify(result)}`);
    }
    return;
  }
}

async function handleXGoodsInteraction(interaction, ctx) {
  // 今はスラッシュのみ
  await handleXGoodsSlash(interaction, ctx);
}

module.exports = { handleXGoodsInteraction };
