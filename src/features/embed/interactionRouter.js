// InteractionCreate から embed（/embed ビルダー）処理を分離するためのルーター
// ※既存メッセージ本文は変更しない方針（/embedは新規機能）

const { handleEmbedSlash } = require('./handlers/slash');
const { handleEmbedButtons } = require('./handlers/buttons');
const { handleEmbedModals } = require('./handlers/modals');
const { handleEmbedSelects } = require('./handlers/selects');

/**
 * embed 系の Interaction を処理します。
 *
 * @param {import('discord.js').Interaction} interaction
 * @param {object} ctx
 */
async function handleEmbedInteraction(interaction, ctx) {
  // スラッシュコマンド（/embed）
  await handleEmbedSlash(interaction, ctx);

  // ビルダーパネルのボタン
  await handleEmbedButtons(interaction, ctx);

  // モーダル submit
  await handleEmbedModals(interaction, ctx);

  // セレクト（色選択、最終メッセージの選択メニュー）
  await handleEmbedSelects(interaction, ctx);
}

module.exports = { handleEmbedInteraction };
