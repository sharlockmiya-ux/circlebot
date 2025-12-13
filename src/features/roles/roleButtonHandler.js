// ロール付与/解除ボタン処理（v15対応）
// ※メッセージ本文は bot.js 既存の文字列を一切変更しない方針

async function safeReply(interaction, payload) {
  if (interaction.deferred) return interaction.editReply(payload);
  if (interaction.replied) return interaction.followUp({ ...payload, ephemeral: payload.ephemeral ?? true });
  return interaction.reply(payload);
}


const { PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');

/**
 * InteractionCreate 側で interaction.isButton() を確認したうえで呼び出してください。
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {{
 *   roleButtons: Array<{ label: string, roleId: string, customId: string }>,
 *   idolRoles: Array<{ id: string, name: string }>
 * }} params
 */
async function handleRoleButtonInteraction(interaction, params = {}) {
  const roleButtons = Array.isArray(params.roleButtons) ? params.roleButtons : [];
  const idolRoles = Array.isArray(params.idolRoles) ? params.idolRoles : [];

  try {
    let roleId = null;
    let mode = 'toggle'; // 'toggle' | 'on' | 'off'

    // デバッグ用：どのボタンが押されたかログに出す
    console.log('Button pressed:', interaction.customId);

    // --- パターン1: 赤/緑スイッチ用（role_on:<id> / role_off:<id>） ---
    const mForce = interaction.customId.match(/^role_(on|off):(\d{17,20})$/);
    if (mForce) {
      mode = mForce[1] === 'on' ? 'on' : 'off';
      roleId = mForce[2];
    }

    // --- パターン2: 旧来のトグル（role:<id>） ---
    const mToggle = interaction.customId.match(/^role:(\d{17,20})$/);
    if (!roleId && mToggle) {
      roleId = mToggle[1];
      mode = 'toggle';
    }

    // --- パターン3: 旧カスタムID（ROLE_BUTTONS の customId に一致） ---
    if (!roleId) {
      const found = roleButtons.find((b) => b.customId === interaction.customId);
      if (found) {
        roleId = found.roleId;
        mode = 'toggle';
      }
    }

    if (!roleId) {
      await safeReply(interaction, {
        content: '❌ 不明なボタンです。',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // 権限チェック（※ボタン利用者ではなく「Botが付与/解除できるか」を確認する）
    // ※メッセージ本文は変更しない方針のため、文言はそのまま
    const me = interaction.guild?.members?.me
      ?? (await interaction.guild?.members.fetchMe().catch(() => null));
    if (!me || !me.permissions?.has(PermissionFlagsBits.ManageRoles)) {
      await safeReply(interaction, {
        content: '❌ ロールを管理する権限がありません。',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) {
      await safeReply(interaction, {
        content: '❌ ロールが見つかりませんでした。',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Botが階層的に操作できないロールは弾く（editable は ManageRoles と階層を加味した判定）
    if (!role.editable) {
      await safeReply(interaction, {
        content: '❌ ロールを管理する権限がありません。',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = interaction.member; // GuildMember
    const hasRole = member.roles.cache.has(roleId);

    // mode に応じて付与/解除
    if (mode === 'on') {
      if (!hasRole) await member.roles.add(roleId);
    } else if (mode === 'off') {
      if (hasRole) await member.roles.remove(roleId);
    } else {
      // toggle
      if (hasRole) await member.roles.remove(roleId);
      else await member.roles.add(roleId);
    }

    // 最新状態を再取得
    const updatedMember = await interaction.guild.members.fetch(member.id);
    const nowHasRole = updatedMember.roles.cache.has(roleId);

    // 付与/解除ログ（メッセージ本文は変更しない）
    const actionText =
      mode === 'on' ? '付与' :
      mode === 'off' ? '解除' :
      (nowHasRole ? '付与' : '解除');

    const embed = new EmbedBuilder()
      .setColor(nowHasRole ? 0x57F287 : 0xED4245)
      .setTitle(`✅ ロール${actionText}`)
      .setDescription(
        [
          `**対象ロール**: <@&${roleId}>`,
          `**ユーザー**: <@${updatedMember.id}>`,
          '',
          '▼ 現在の担当アイドル',
          idolRoles.map((idol) => {
            const hasIdol = updatedMember.roles.cache.has(idol.id);
            const status = hasIdol ? '🟢' : '⚫';
            return `${status} ${idol.name}`;
          }).join('\n'),
        ].join('\n'),
      )
      .setTimestamp();

    await safeReply(interaction, {
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });

  } catch (err) {
    console.error('❌ Role button error:', err);
    try {
      await safeReply(interaction, {
        content: '❌ エラーが発生しました。',
        flags: MessageFlags.Ephemeral,
      });
    } catch (_) {}
  }
}

module.exports = { handleRoleButtonInteraction };

