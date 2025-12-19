// src/features/moti/monthlyDmReminder.js
// 月間調査の「未入力メンバー」にDMを送る処理本体

const { getAllMonthlyRecords } = require('../../stores/motiMonthSheetStore');

const MAIN_GUILD_ID = process.env.MAIN_GUILD_ID;

// ✅ 移行性重視：未設定なら投稿しない（固定IDフォールバックは廃止）
const MOTI_DM_LOG_CHANNEL_ID = process.env.MOTI_DM_LOG_CHANNEL_ID || null;

// 月間調査の「未入力メンバー」にDMを送る処理本体
async function runMonthlyDmReminder(client, opts = {}) {
  if (!MAIN_GUILD_ID) {
    console.warn('MAIN_GUILD_ID が設定されていないため、月間DMリマインドをスキップします。');
    return { monthKey: null, successIds: [], failedIds: [], targetCount: 0 };
  }

  const monthKey = opts.monthKey || new Date().toISOString().slice(0, 7); // "YYYY-MM"

  try {
    const guild = await client.guilds.fetch(MAIN_GUILD_ID);
    // 全メンバーを取得（キャッシュだけだと抜けが出る可能性があるので fetch）
    await guild.members.fetch();
    const allMembers = guild.members.cache.filter(m => !m.user.bot);

    // 月間調査の全レコードを取得
    const allRecords = await getAllMonthlyRecords();
    const submittedUserIds = new Set(
      allRecords
        .filter(r => r.monthKey === monthKey)
        .map(r => r.userId),
    );

    // 「サーバーにいるメンバー」−「その月に入力済み」＝ 未入力者
    const targets = allMembers.filter(m => !submittedUserIds.has(m.id));

    console.log(`[moti] month DM remind target count=${targets.size} for ${monthKey}`);

    const successIds = [];
    const failedIds = [];

    for (const [id, member] of targets) {
      try {
        await member.send([
          'こちらは放課後アイドル部運営です。',
          '',
          '今月の「**月間調査**」への入力がまだ確認できておりません。',
          'お手数ですが、以下のコマンドから入力をお願いいたします。',
          '',
          '∥ `/input_month` … 月間入力フォームを開きます。',
          '',
          '※ すでに入力済みの場合は、このメッセージは行き違いです。お手数ですが破棄してください。',
        ].join('\n'));

        successIds.push(id);
        // レートリミット緩和のため少し待つ（1秒）
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error('[moti] month DM send failed for', id, err);
        failedIds.push(id);
      }
    }

    console.log(`[moti] month DM remind done: success=${successIds.length}, failed=${failedIds.length}`);

    // 🔔 結果を指定チャンネルにレポート
    try {
      if (!MOTI_DM_LOG_CHANNEL_ID) {
        console.warn('[moti] MOTI_DM_LOG_CHANNEL_ID が未設定のため、DMレポート投稿をスキップします。');
      } else {
        const logChannel = await client.channels.fetch(MOTI_DM_LOG_CHANNEL_ID);
        if (logChannel && logChannel.isTextBased()) {
          const targetIds = Array.from(targets.keys());

          const formatMentions = (ids, label) => {
            if (!ids || ids.length === 0) return null;
            const limit = 20;
            const head = ids.slice(0, limit).map(id => `<@${id}>`).join(', ');
            const rest = ids.length - limit;
            return `${label}: ${head}${rest > 0 ? ` …他${rest}名` : ''}`;
          };

          const lines = [
            '【月間モチベ自動DMレポート】',
            `対象月: **${monthKey}**`,
            `対象メンバー数: ${targets.size}`,
            `送信成功: ${successIds.length}件`,
            `送信失敗: ${failedIds.length}件`,
          ];

          const targetLine = formatMentions(targetIds, '今回のDM対象者');
          if (targetLine) lines.push('', targetLine);

          const successLine = formatMentions(successIds, 'DM送信に成功したメンバー');
          if (successLine) lines.push('', successLine);

          const failedLine = formatMentions(failedIds, 'DM送信に失敗したメンバー');
          if (failedLine) lines.push('', failedLine);

          await logChannel.send(lines.join('\n'));
        }
      }
    } catch (logErr) {
      console.error('[moti] month DM log send failed:', logErr);
    }

    return {
      monthKey,
      successIds,
      failedIds,
      targetCount: targets.size,
    };
  } catch (err) {
    console.error('[moti] month DM remind fatal error:', err);
    return { monthKey, successIds: [], failedIds: [], targetCount: 0, error: err };
  }
}

module.exports = { runMonthlyDmReminder };
