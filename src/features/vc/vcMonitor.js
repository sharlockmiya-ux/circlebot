// VC入室／退出監視（複数VC対応 + Embedログ + REC表示 + オプション音声）
// ※メッセージ本文（Embedタイトル/本文など）は bot.js 既存の文字列を一切変更しない方針

const path = require('path');

const {
  EmbedBuilder,
  Events,
} = require('discord.js');

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
} = require('@discordjs/voice');

// ===== VC監視設定（env） =====
const VC_LOG_CHANNEL_ID = process.env.VC_LOG_CHANNEL_ID || null;

const VC_TARGET_CHANNELS = (process.env.VC_TARGET_CHANNELS || '')
  .split(',')
  .map(id => id.trim())
  .filter(id => id.length > 0);

const VC_PLAY_ONLINE_SOUND = (process.env.VC_PLAY_ONLINE_SOUND === 'true');

// 音声ファイル（VC開始時のonline音）
// bot.js では __dirname 基準だったが、機能分割後は CWD 基準で同等に扱う
const VC_ONLINE_SOUND_PATH = path.join(process.cwd(), 'sounds', 'online.mp3');

// ★ 追加：VCの“元の名前”を固定で持たせる（再起動対策）
const VC_BASE_NAME_MAP = (() => {
  try {
    return JSON.parse(process.env.VC_BASE_NAME_MAP || '{}');
  } catch {
    console.warn('VC_BASE_NAME_MAP の JSON が不正です。{} として扱います。');
    return {};
  }
})();

// REC名判定（あなたの命名規則に合わせた完全一致）
const isRecName = (name) => /^🎙️｜🔴REC：会話中\d+名$/.test(name);

// メモリ保険（固定名がないVCのため）
const originalVcNames = new Map();

// ★ 安全な書き方（1行の明示return）
const getBaseName = (vc) => {
  return VC_BASE_NAME_MAP[vc.id]
    || originalVcNames.get(vc.id)
    || vc.name;
};

// === VCログ自動削除（3日経ったログを消す） ===
const VC_LOG_MESSAGE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3日

async function cleanupOldVcLogs(client) {
  if (!VC_LOG_CHANNEL_ID) return;

  try {
    const channel = await client.channels.fetch(VC_LOG_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    const now = Date.now();
    let fetched;

    do {
      // 直近100件を取得
      fetched = await channel.messages.fetch({ limit: 100 });

      const targets = fetched.filter((m) => {
        // Bot自身のメッセージのみ
        if (m.author.id !== client.user.id) return false;
        // 3日より新しいものは残す
        if (m.createdTimestamp > now - VC_LOG_MESSAGE_MAX_AGE_MS) return false;
        // Embedが無いものはスキップ
        if (!m.embeds || m.embeds.length === 0) return false;

        const title = m.embeds[0].title ?? '';

        // VCログ用のタイトルだけを対象にする
        return (
          title.startsWith('🎧 VC開始') ||
          title.startsWith('🔴 VC終了') ||
          title.startsWith('🟢 VC入室') ||
          title.startsWith('🟡 VC退出')
        );
      });

      if (targets.size === 0) break;

      await channel.bulkDelete(targets, true);
      console.log(`🧹 VCログ自動削除: ${targets.size}件削除しました`);

      // レートリミット回避のため2秒待機
      await new Promise(r => setTimeout(r, 2000));

      // 100件以上古いメッセージがある場合は、もう一度ループ
    } while (fetched.size === 100);
  } catch (err) {
    console.error('VCログ自動削除エラー:', err);
  }
}

async function primeBaseNamesOnBoot(client) {
  // 設定がなければ何もしない
  if (!VC_TARGET_CHANNELS.length) return;

  // ★ 追加：起動時に監視対象VCの元名を確保（再起動後の復元精度UP）
  for (const vcId of VC_TARGET_CHANNELS) {
    const ch = await client.channels.fetch(vcId).catch(() => null);
    if (ch && ch.isVoiceBased()) {
      const baseFromConfig = VC_BASE_NAME_MAP[vcId];
      if (baseFromConfig) {
        originalVcNames.set(vcId, baseFromConfig);
      } else if (!isRecName(ch.name)) {
        originalVcNames.set(vcId, ch.name);
      }
    }
  }
}

function startVcLogCleanupTimer(client) {
  // === VCログ自動削除 ===
  setInterval(() => cleanupOldVcLogs(client), 3 * 60 * 60 * 1000);
  cleanupOldVcLogs(client);
}

function registerVcMonitor(client) {
  // === VC入室／退出監視（複数VC対応 + Embedログ + REC表示 + オプション音声） ===
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      // 設定がなければ何もしない
      if (!VC_TARGET_CHANNELS.length || !VC_LOG_CHANNEL_ID) return;

      const guild = newState.guild || oldState.guild;
      if (!guild) return;

      const beforeId = oldState.channelId;
      const afterId  = newState.channelId;

      const isTargetBefore = VC_TARGET_CHANNELS.includes(beforeId);
      const isTargetAfter  = VC_TARGET_CHANNELS.includes(afterId);

      // 監視対象VCに関係ない動きはスキップ
      if (!isTargetBefore && !isTargetAfter) return;

      const logChannel = guild.channels.cache.get(VC_LOG_CHANNEL_ID);
      const user       = newState.member || oldState.member;

      // Bot自身はスキップ
      if (user && user.user.bot) return;

      // 監視対象VCごとに処理
      for (const vcId of VC_TARGET_CHANNELS) {
        const vc = guild.channels.cache.get(vcId);
        if (!vc || vc.type !== 2) continue; // 2 = ボイスチャンネル

        if (!originalVcNames.has(vc.id)) {
          const baseFromConfig = VC_BASE_NAME_MAP[vc.id];
          if (baseFromConfig) {
            originalVcNames.set(vc.id, baseFromConfig);
          } else if (!isRecName(vc.name)) {
            originalVcNames.set(vc.id, vc.name);
          }
        }

        const baseName = getBaseName(vc);
        const humanCount = vc.members.filter(m => !m.user.bot).size;

        // === 1) このVCに「入った」ケース ===
        if (afterId === vcId && beforeId !== vcId) {

          // 0→1人になった瞬間 = VC開始
          if (humanCount === 1) {
            // VC開始Embed
            if (logChannel?.isTextBased()) {
              const startEmbed = new EmbedBuilder()
                .setColor(0x00AEEF)
                .setTitle('🎧 VC開始')
                .setDescription(`VC「${baseName}」が開始されました。`)
                .setTimestamp();
              await logChannel.send({ embeds: [startEmbed] });
            }

            // online音声（ON のときだけ & 1人目だけ）
            if (VC_PLAY_ONLINE_SOUND) {
              console.log('try play online sound on vc:', vc.id, 'path:', VC_ONLINE_SOUND_PATH);
              try {
                const connection = joinVoiceChannel({
                  channelId: vc.id,
                  guildId: vc.guild.id,
                  adapterCreator: vc.guild.voiceAdapterCreator,
                });

                const player = createAudioPlayer({
                  behaviors: { noSubscriber: NoSubscriberBehavior.Stop },
                });

                const resource = createAudioResource(VC_ONLINE_SOUND_PATH);
                player.play(resource);
                connection.subscribe(player);

                player.on('error', (err) => {
                  console.error('audio player error:', err);
                });

                player.once(AudioPlayerStatus.Playing, () => {
                  console.log('online sound: now playing');
                });

                player.once(AudioPlayerStatus.Idle, () => {
                  console.log('online sound: finished, disconnect');
                  connection.destroy();
                });

              } catch (err) {
                console.error('online音声再生エラー:', err);
              }
            }
          }

          // 入室ログ（毎回）
          if (logChannel?.isTextBased()) {
            const joinEmbed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🟢 VC入室')
              .setDescription(
                [
                  `${user} が VC「${baseName}」に参加しました。`,
                  `現在：**${humanCount}名**`,
                ].join('\n')
              )
              .setTimestamp();
            await logChannel.send({ embeds: [joinEmbed] });
          }

          // チャンネル名を REC 表示に更新
          try {
            await vc.setName(`🎙️｜🔴REC：会話中${humanCount}名`);
          } catch (err) {
            console.error('VC名変更エラー(入室):', err);
          }
        }

        // === 2) このVCから「出た」ケース ===
        if (beforeId === vcId && afterId !== vcId) {
          if (humanCount === 0) {
            // 全員退出 → VC終了
            if (logChannel?.isTextBased()) {
              const endEmbed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('🔴 VC終了')
                .setDescription(`VC「${baseName}」から全員が退出しました。`)
                .setTimestamp();
              await logChannel.send({ embeds: [endEmbed] });
            }

            // チャンネル名を元に戻す
            try {
              await vc.setName(baseName);
              originalVcNames.delete(vc.id);
            } catch (err) {
              console.error('VC名変更エラー(終了):', err);
            }
          } else {
            // まだ人がいる → 人数だけ更新（退出ログ付き）
            if (logChannel?.isTextBased()) {
              const leaveEmbed = new EmbedBuilder()
                .setColor(0xFEE75C)
                .setTitle('🟡 VC退出')
                .setDescription(
                  [
                    `${user} が VC「${baseName}」から退出しました。`,
                    `現在：**${humanCount}名**`,
                  ].join('\n')
                )
              .setTimestamp();
              await logChannel.send({ embeds: [leaveEmbed] });
            }

            try {
              await vc.setName(`🎙️｜🔴REC：会話中${humanCount}名`);
            } catch (err) {
              console.error('VC名変更エラー(退出):', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('[vc] voiceStateUpdate error:', err);
    }
  });
}

module.exports = {
  registerVcMonitor,
  primeBaseNamesOnBoot,
  startVcLogCleanupTimer,
};
