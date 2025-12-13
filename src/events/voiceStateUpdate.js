const { Events } = require('discord.js');

// VCの実処理は features 側に置き、events 側は「入口」と「登録」だけを担当する
const {
  registerVcMonitor,
  primeBaseNamesOnBoot,
  startVcLogCleanupTimer,
} = require('../features/vc/vcMonitor');

/**
 * VoiceStateUpdate の入口（登録）
 * - 二重登録を避けるため、client にフラグを持たせる
 */
function registerVoiceStateUpdate(client) {
  if (!client) return;
  if (client.__circlebot_vc_monitor_registered) return;

  // registerVcMonitor() の中で Events.VoiceStateUpdate を購読する
  registerVcMonitor(client);

  client.__circlebot_vc_monitor_registered = true;
  console.log('[vc] VoiceStateUpdate registered');
}

/**
 * ready 時に必要な VC 初期化（ログ削除タイマー + 起動時の元名確保）
 */
async function onReadyVcInit(client) {
  try {
    startVcLogCleanupTimer(client);
  } catch (e) {
    console.error('[vc] startVcLogCleanupTimer failed:', e);
  }

  try {
    await primeBaseNamesOnBoot(client);
  } catch (e) {
    console.error('[vc] primeBaseNamesOnBoot failed:', e);
  }
}

module.exports = {
  registerVoiceStateUpdate,
  onReadyVcInit,
};
