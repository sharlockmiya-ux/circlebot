// InteractionCreate からロールボタン処理だけを分離するためのルーター
// ※メッセージ本文（返信文字列）は一切変更しない方針

const { handleRoleButtonInteraction } = require('./roleButtonHandler');

/**
 * ロール付与/解除ボタンを処理します。
 * InteractionCreate 側で interaction.isButton() を確認したうえで呼び出してください。
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {{ roleButtons: Array<{ label: string, roleId: string, customId: string }>, idolRoles: Array<{ id: string, name: string }> }} params
 */
async function tryHandleRoleButtons(interaction, params) {
  // 現状の仕様では「ボタン＝ロールボタン」として扱う（既存挙動維持）
  // 将来的に他ボタンが増えた場合は、ここで customId 判定して振り分ける。
  return handleRoleButtonInteraction(interaction, params);
}

module.exports = { tryHandleRoleButtons };
