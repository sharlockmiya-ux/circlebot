// src/features/moti/scheduler.js
// 月初お知らせ＋月間DMリマインド（cron）

const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');

const { runMonthlyDmReminder } = require('./monthlyDmReminder');

const MOTI_NOTICE_CHANNEL_ID = process.env.MOTI_NOTICE_CHANNEL_ID;

let _scheduled = false;

function setupMotiMonthlyReminder(client) {
  // 二重登録防止（再起動/複数呼び出し対策）
  if (_scheduled) return;
  _scheduled = true;

  // 毎月1日 10:00 に実行（必要ならここはお好みで変更OK）
  cron.schedule(
    '0 10 1 * *',
    async () => {
      try {
        if (!MOTI_NOTICE_CHANNEL_ID) {
          console.error('moti reminder: 通知表チャンネルを取得できませんでした');
          return;
        }

        const channel = await client.channels.fetch(MOTI_NOTICE_CHANNEL_ID);
        if (!channel || !channel.isTextBased()) {
          console.error('moti reminder: 通知表チャンネルを取得できませんでした');
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0xef4444)
          .setDescription([
            '# :clipboard:月初のご案内',
            '',
            '以下の要領で、月間モチベーションの入力をお願いいたします。',
            '',
            '## 月間モチベ調査（必須）',
            '`/input_month`',
            '・month: 該当月（例: 2025-11） ※省略時は今月',
            '・今月の育成数（現在の総育成数を入力）',
            '・今月のファン数（現在の総ファン数を入力）',
            '',
            '## 任意の振り返り',
            '`/month_me` … ご自身の成績推移の確認',
          ].join('\n'))
          .setFooter({ text: '※このお知らせは 3 日後に自動で削除されます。' });

        const msg = await channel.send({
          content: '@everyone',
          embeds: [embed],
          allowedMentions: {
            parse: ['everyone'], // @everyone をちゃんと有効にする
          },
        });

        // 3日後に自動削除
        setTimeout(() => {
          msg.delete().catch(() => {});
        }, 3 * 24 * 60 * 60 * 1000);
      } catch (err) {
        console.error('moti reminder error:', err);
      }
    },
    {
      timezone: 'Asia/Tokyo',
    },
  );

  // 毎月3日 21:00 に「月間モチベ未入力者へのDMリマインド」を実行
  cron.schedule(
    '0 21 3 * *',
    () => runMonthlyDmReminder(client, {}),
    {
      timezone: 'Asia/Tokyo',
    },
  );
}

module.exports = { setupMotiMonthlyReminder };
