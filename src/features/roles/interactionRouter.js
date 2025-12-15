// InteractionCreate からロールボタン処理だけを分離するためのルーター
// ※メッセージ本文（返信文字列）は一切変更しない方針

const { handleRoleButtonInteraction } = require('./roleButtonHandler');

function isRoleButtonCustomId(customId, roleButtons) {
  if (typeof customId !== 'string' || !customId) return false;

  // --- パターン1: 赤/緑スイッチ用（role_on:<id> / role_off:<id>） ---
  if (/^role_(on|off):(\d{17,20})$/.test(customId)) return true;

  // --- パターン2: 旧来のトグル（role:<id>） ---
  if (/^role:(\d{17,20})$/.test(customId)) return true;

  // --- パターン3: 旧カスタムID（ROLE_BUTTONS の customId に一致） ---
  if (Array.isArray(roleButtons) && roleButtons.some((b) => b?.customId === customId)) return true;

  return false;
}

/**
 * ロール付与/解除ボタンを処理します。
 * InteractionCreate 側で interaction.isButton() を確認したうえで呼び出してください。
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {{ roleButtons: Array<{ label: string, roleId: string, customId: string }>, idolRoles: Array<{ id: string, name: string }> }} params
 * @returns {Promise<boolean>} handled
 */
async function tryHandleRoleButtons(interaction, params) {
  const roleButtons = Array.isArray(params?.roleButtons) ? params.roleButtons : [];

  // ロール系customId以外は“未処理”として返す（他機能のボタンが増えても壊さない）
  if (!isRoleButtonCustomId(interaction.customId, roleButtons)) return false;

  await handleRoleButtonInteraction(interaction, params);
  return true;
}

module.exports = { tryHandleRoleButtons };
