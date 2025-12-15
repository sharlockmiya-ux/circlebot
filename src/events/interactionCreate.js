// ===== InteractionCreate entry (v15 refactor) =====
// 入口を src/events に集約し、bot.js 側は登録呼び出しだけにします。

const { Events, MessageFlags } = require('discord.js');

const { tryHandleRoleButtons } = require('../features/roles/interactionRouter');
const { handleEmbedInteraction } = require('../features/embed/interactionRouter');
const { handleMotiInteraction } = require('../features/moti/interactionRouter');

function registerInteractionCreate(client, ctx) {
  const { ROLE_BUTTONS, IDOL_ROLES } = ctx;

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // ===== ボタン（ロール付与/解除） =====
      if (interaction.isButton()) {
        const handled = await tryHandleRoleButtons(interaction, {
          roleButtons: ROLE_BUTTONS,
          idolRoles: IDOL_ROLES,
        });
        if (handled) return;
      }

      // ===== embed（/embed ビルダー） =====
      await handleEmbedInteraction(interaction, { client, ...ctx });

      // ===== moti（スラッシュ/モーダル等） =====
      await handleMotiInteraction(interaction, { client, ...ctx });
    } catch (err) {
      console.error('❌ InteractionCreate error:', err);

      // Interaction未応答のときだけ、落ちないように最小限の応答を試みる
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: '❌ エラーが発生しました。',
          });
        }
      } catch (_) {
        // ignore
      }
    }
  });
}

module.exports = { registerInteractionCreate };
