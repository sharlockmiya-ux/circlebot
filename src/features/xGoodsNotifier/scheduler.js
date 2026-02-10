// src/features/xGoodsNotifier/scheduler.js
// 毎朝 6:35(JST) に、当日締切グッズまとめ投稿をチェックして通知

const cron = require('node-cron');

const { runXGoodsNotifier } = require('./notifier');

let _scheduled = false;

function setupXGoodsNotifier(client) {
  if (_scheduled) return;
  _scheduled = true;

  console.log('[xGoodsNotifier] scheduler: registering daily job (06:35 JST)');

  cron.schedule(
    '35 6 * * *',
    async () => {
      try {
        await runXGoodsNotifier(client, { reason: 'cron' });
      } catch (e) {
        // notifier 側で基本握るが、万一の保険
        console.error('[xGoodsNotifier] cron tick failed:', e?.message || e);
      }
    },
    { timezone: 'Asia/Tokyo' },
  );
}

module.exports = { setupXGoodsNotifier };
