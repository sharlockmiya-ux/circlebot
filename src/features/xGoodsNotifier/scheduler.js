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
      await runXGoodsNotifier(client, { reason: 'cron' });
    },
    { timezone: 'Asia/Tokyo' },
  );
}

module.exports = { setupXGoodsNotifier };
