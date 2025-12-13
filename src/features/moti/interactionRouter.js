// InteractionCreate から moti（スラッシュ/モーダル等）処理を分離するためのルーター
// ※メッセージ本文（返信文字列）は一切変更しない方針

const { handleMotiSlash } = require('./slashHandlers');
const { handleMotiModalSubmit } = require('./modalHandlers');

/**
 * moti 系の Interaction を処理します。
 * InteractionCreate 側で roles を先に処理した後に呼び出してください。
 *
 * @param {import('discord.js').Interaction} interaction
 * @param {object} ctx
 */
async function handleMotiInteraction(interaction, ctx) {
  // スラッシュ（/moti_*）
  await handleMotiSlash(interaction, ctx);

  // モーダル送信（motiInputModal / motiMonthInputModal）
  await handleMotiModalSubmit(interaction, ctx);
}

module.exports = { handleMotiInteraction };
