// ===== InteractionCreate entry (v15 refactor) =====
// 入口を src/events に集約し、bot.js 側は登録呼び出しだけにします。

const { Events } = require('discord.js');

const { tryHandleRoleButtons } = require('../features/roles/interactionRouter');
const { handleMotiInteraction } = require('../features/moti/interactionRouter');

function registerInteractionCreate(client, ctx) {
  const { ROLE_BUTTONS, IDOL_ROLES } = ctx;

  client.on(Events.InteractionCreate, async (interaction) => {
    // ===== ボタン（ロール付与/解除） =====
    if (interaction.isButton()) {
      return tryHandleRoleButtons(interaction, { roleButtons: ROLE_BUTTONS, idolRoles: IDOL_ROLES });
    }

    // ===== moti（スラッシュ/モーダル等） =====
    return handleMotiInteraction(interaction, { client, ...ctx });
  });
}

module.exports = { registerInteractionCreate };
