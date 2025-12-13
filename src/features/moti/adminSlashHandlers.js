// moti の運営専用コマンドを slashHandlers から分離
// ※本文（返信文字列）は一切変更しない方針

const {
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

async function tryHandleMotiAdminSlash(interaction, ctx, opts = {}) {
  if (!interaction.isChatInputCommand()) return false;

  const { commandName } = interaction;

  if (commandName === 'moti_season_close') {
    await handleMotiSeasonClose(interaction, ctx);
    return true;
  }

  if (commandName === 'moti_month_report') {
    await handleMotiMonthReport(interaction, ctx);
    return true;
  }

  if (commandName === 'moti_report') {
    await handleMotiReport(interaction, ctx, opts);
    return true;
  }

  if (commandName === 'moti_month_remind') {
    await handleMotiMonthRemind(interaction, ctx);
    return true;
  }

  if (commandName === 'moti_notion') {
    await handleMotiNotion(interaction, ctx, opts);
    return true;
  }

  return false;
}

async function handleMotiSeasonClose(interaction, ctx) {
  const { client, CURRENT_SEASON, MOTI_NOTICE_CHANNEL_ID } = ctx;
  const { commandName } = interaction;
            // ---------- /moti_season_close → シーズン終了案内テンプレ（運営専用） ----------
        if (commandName === 'moti_season_close') {
          try {
            const member = interaction.member;
            if (!member || !member.permissions || !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
              await interaction.reply({
                content: 'このコマンドは運営のみ実行できます。',
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            const optionSeason = interaction.options.getString('season');
            const seasonLabel = optionSeason || CURRENT_SEASON || '不明なシーズン';

            // まずはすぐに応答しておく（Discord に「応答あり」と認識させる）
            await interaction.reply({
              content: `シーズン ${seasonLabel} の終了案内テンプレートを送信します。`,
              flags: MessageFlags.Ephemeral,
            });

            // 成績通知用チャンネルを取得
            const channel = await client.channels.fetch(MOTI_NOTICE_CHANNEL_ID).catch(() => null);
            if (!channel || !channel.isTextBased()) {
              await interaction.editReply({
                content: '成績通知用チャンネルを取得できませんでした。MOTI_NOTICE_CHANNEL_ID の設定を確認してください。',
              });
              return;
            }

            const embed = new EmbedBuilder()
              .setTitle(`🏁 シーズン ${seasonLabel} 終了のご案内`)
              .setColor(0x3b82f6)
              .setDescription([
                '今シーズンもコンテストお疲れさまでした。',
                `本メッセージは、シーズン **${seasonLabel}** の終了に伴う育成入力のご案内です。`,
                '',
                '以下の要領で、今期の最終成績のご入力をお願いいたします。',
                '',
                '【入力方法】',
                '/moti_input',
                '・season: 該当シーズン（例: S35）',
                '・現在の順位（終了時点の順位）',
                '・現在の育成数（終了時点の累計）',
                '',
                '【任意の振り返り】',
                '/moti_me … ご自身の成績推移の確認',
                '/moti_summary / /moti_summary_all … シーズンごとのサマリー確認',
              ].join('\n'))
              .setFooter({
                text: '※入力いただいた成績は、今後のレポートおよび運営判断の参考とさせていただきます。',
              });

            await channel.send({ embeds: [embed] });

            await interaction.editReply({
              content: `✅ シーズン ${seasonLabel} の終了案内テンプレートを通知チャンネルに送信しました。`,
            });

            console.log(`[moti_season_close] replied for season=${seasonLabel}`);
            return;
          } catch (error) {
            console.error('moti_season_close error:', error);
            if (interaction.deferred || interaction.replied) {
              await interaction.editReply({
                content: 'シーズン終了案内の送信中にエラーが発生しました。ログを確認してください。',
              });
            } else {
              await interaction.reply({
                content: 'シーズン終了案内の送信中にエラーが発生しました。ログを確認してください。',
                flags: MessageFlags.Ephemeral,
              });
            }
            return;
          }
        }

}

async function handleMotiMonthReport(interaction, ctx) {
  const { getAllMonthlyRecords } = ctx;
  const { commandName } = interaction;
              // ---------- /moti_month_report → 月間モチベ集計（運営専用） ----------
        if (commandName === 'moti_month_report') {
          // 引数の month を正規化（YYYY-MM）
          const rawMonth = interaction.options.getString('month');
          let monthKey = '';

          if (rawMonth && rawMonth.trim() !== '') {
            const normalized = rawMonth.trim().replace(/[./]/g, '-');
            const m = normalized.match(/^(\d{4})-?(\d{1,2})$/);
            if (m) {
              const year = m[1];
              const month = String(Number(m[2])).padStart(2, '0');
              monthKey = `${year}-${month}`;
            }
          }

        

          // 入力なし or パース失敗時は今月
          if (!monthKey) {
            monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
          }

          const allRecords = await getAllMonthlyRecords();
          const monthRecords = allRecords.filter(r => r.monthKey === monthKey);

          if (!monthRecords.length) {
            await interaction.reply({
              content: `対象月 **${monthKey}** の月間モチベ記録はまだありません。`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }


          // ユーザー別に集計
          const byUser = new Map();
          for (const r of monthRecords) {
            if (!byUser.has(r.userId)) {
              byUser.set(r.userId, {
                userId: r.userId,
                username: r.username || '(no name)',
                grow: 0,
                fans: 0,
                count: 0,
              });
            }
            const bucket = byUser.get(r.userId);
            bucket.grow += r.grow;
            bucket.fans += r.fans;
            bucket.count += 1;
          }

          const rows = [...byUser.values()];

          // サークル平均育成数（1人あたり）
          const totalGrow = rows.reduce((sum, u) => sum + u.grow, 0);
          const totalFans = rows.reduce((sum, u) => sum + u.fans, 0);
          const memberCount = rows.length;
          const avgGrow = memberCount ? totalGrow / memberCount : 0;

          // 育成数の多い順にソート
          rows.sort((a, b) => b.grow - a.grow);

          const lines = [];
          const maxRows = 20;

          rows.forEach((u, index) => {
            const diff = u.grow - avgGrow;
            const mark =
              diff > 0 ? '🟢' :
              diff < 0 ? '🔻' :
              '➖';
            const diffText = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}`;

            const rank = index + 1;
            const mention = `<@${u.userId}>`;

            lines.push(
              `${rank}. ${mention}｜育成 ${u.grow}（平均 ${avgGrow.toFixed(1)} / 差分 ${diffText}）${mark}｜ファン +${u.fans}`
            );
          });

          let shownLines = lines;
          if (lines.length > maxRows) {
            shownLines = [
              ...lines.slice(0, maxRows),
              `…ほか **${lines.length - maxRows} 名**`,
            ];
          }

          const headerLines = [
            `対象月: **${monthKey}**`,
            `参加メンバー: **${memberCount} 人**`,
            `総育成数: **${totalGrow}**｜総ファン増加: **+${totalFans}**`,
            `1人あたり平均育成数: **${avgGrow.toFixed(1)}**`,
            '',
            '※ 差分は「個人の育成数 − サークル平均育成数」です。',
          ];

          const embed = new EmbedBuilder()
            .setTitle(`📊 月間モチベ集計レポート｜${monthKey}`)
            .setColor(0xf97316)
            .setDescription([...headerLines, ...shownLines].join('\n'))
            .setFooter({ text: 'このレポートは ManageGuild 権限を持つ運営向けです。' });

          await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

      

}

async function handleMotiReport(interaction, ctx, opts) {
  const { getAllRecords } = ctx;
  const { season, seasonLabel } = opts;
  const { commandName } = interaction;
        // ---------- /moti_report → 全員分（運営専用） ----------
        if (commandName === 'moti_report') {
          const member = interaction.member;
          if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({
              content: 'このコマンドは運営のみ実行できます。',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const records = await getAllRecords(season);
          if (!records.length) {
            await interaction.reply({
              content: `${seasonLabel} の記録がまだありません。`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const byUser = new Map();
          for (const r of records) {
            if (!byUser.has(r.userId)) byUser.set(r.userId, []);
            byUser.get(r.userId).push(r);
          }

          const latestDeltas = [];
          for (const recs of byUser.values()) {
            recs.sort((a, b) => a.timestamp - b.timestamp);
            if (recs.length >= 2) {
              const last = recs[recs.length - 1];
              const prev = recs[recs.length - 2];
              latestDeltas.push(last.grow - prev.grow);
            }
          }

          const avgDelta = latestDeltas.length
            ? latestDeltas.reduce((a, b) => a + b, 0) / latestDeltas.length
            : 0;

          const embed = new EmbedBuilder()
            .setTitle(`今週の成績推移レポート（${seasonLabel}）`)
            .setDescription('各メンバーの順位・育成数の直近推移と平均との差をまとめています。');

          for (const [userId, recs] of byUser.entries()) {
            recs.sort((a, b) => a.timestamp - b.timestamp);
            const latest = recs.slice(-10);

            const username = latest[latest.length - 1].username ?? 'Unknown';

            const ranks = latest.map(r => r.rank);
            const grows = latest.map(r => r.grow);

            const lastRank = ranks[ranks.length - 1];
            const prevRank = ranks[ranks.length - 2] ?? lastRank;

            const lastGrow = grows[grows.length - 1];
            const prevGrow = grows[grows.length - 2] ?? lastGrow;

            const rankDiff = lastRank - prevRank;
            const growDiff = lastGrow - prevGrow;
            const diffFromAvg = growDiff - avgDelta;

            const growMark =
              diffFromAvg > 0 ? '🔺' :
              diffFromAvg < 0 ? '🔻' :
              '➖';

            const rankText = ranks.join(' → ');
            const growText = `${prevGrow} → ${lastGrow}`;

            embed.addFields({
              name: `🎤 ${username}`,
              value:
                `順位: ${rankText}\n` +
                `　┗ 直近変化: ${rankDiff >= 0 ? '+' : ''}${rankDiff}\n\n` +
                `育成数: ${growText}\n` +
                `　┗ 直近増加: +${growDiff}（平均 ${avgDelta.toFixed(1)}）${growMark}`,
              inline: false,
            });
          }

          await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }


}

async function handleMotiMonthRemind(interaction, ctx) {
  const { runMonthlyDmReminder } = ctx;
  const { commandName } = interaction;
              // ---------- /moti_month_remind → 月間モチベ未入力者にDM送信（運営専用） ----------
        if (commandName === 'moti_month_remind') {
          if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({
              content: 'このコマンドは運営専用です。',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          // 引数の month を正規化（YYYY-MM）
          const rawMonth = interaction.options.getString('month');
          let monthKey = '';

          if (rawMonth && rawMonth.trim() !== '') {
            const normalized = rawMonth.trim().replace(/[./]/g, '-');
            const m = normalized.match(/^(\d{4})-?(\d{1,2})$/);
            if (m) {
              const year = m[1];
              const month = String(Number(m[2])).padStart(2, '0');
              monthKey = `${year}-${month}`;
            }
          }

          // 入力なし or パース失敗時は今月
          if (!monthKey) {
            monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          const result = await runMonthlyDmReminder(interaction.client, { monthKey });

          if (!result || result.targetCount === 0) {
            await interaction.editReply({
              content: `対象月 **${monthKey}** について、未入力メンバーは見つかりませんでした。`,
            });
            return;
          }

          const { successIds, failedIds, targetCount } = result;

          const lines = [
            `対象月 **${monthKey}** の未入力メンバーにDMを送信しました。`,
            `対象メンバー数: ${targetCount}`,
            `送信成功: ${successIds.length} 件`,
            `送信失敗: ${failedIds.length} 件`,
          ];

          if (failedIds.length) {
            const mentions = failedIds.map(id => `<@${id}>`).join(', ');
            lines.push('', `DM送信に失敗したメンバー: ${mentions}`);
          }

          await interaction.editReply({
            content: lines.join('\n'),
          });
          return;
        }



}

async function handleMotiNotion(interaction, ctx, opts) {
  const { getAllRecords } = ctx;
  const { season, seasonLabel } = opts;
  const { commandName } = interaction;
        // ---------- /moti_notion → Notion用表（運営専用） ----------
        if (commandName === 'moti_notion') {
          const member = interaction.member;
          if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({
              content: 'このコマンドは運営のみ実行できます。',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const records = await getAllRecords(season);
          if (!records.length) {
            await interaction.reply({
              content: `${seasonLabel} の記録がまだありません。`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const byUser = new Map();
          for (const r of records) {
            if (!byUser.has(r.userId)) byUser.set(r.userId, []);
            byUser.get(r.userId).push(r);
          }

          const latestDeltas = [];
          for (const recs of byUser.values()) {
            recs.sort((a, b) => a.timestamp - b.timestamp);
            if (recs.length >= 2) {
              const last = recs[recs.length - 1];
              const prev = recs[recs.length - 2];
              latestDeltas.push(last.grow - prev.grow);
            }
          }

          const avgDelta = latestDeltas.length
            ? latestDeltas.reduce((a, b) => a + b, 0) / latestDeltas.length
            : 0;

          let notionTable =
            '| メンバー | 順位推移 | 最終順位 | 直近順位変化 | 育成数推移 | 直近増加数 | 増加数平均との差 |\n' +
            '|---------|----------|----------|--------------|------------|------------|-----------------|\n';

          for (const [userId, recs] of byUser.entries()) {
            recs.sort((a, b) => a.timestamp - b.timestamp);
            const latest = recs.slice(-10);

            const username = latest[latest.length - 1].username ?? 'Unknown';

            const ranks = latest.map(r => r.rank);
            const grows = latest.map(r => r.grow);

            const lastRank = ranks[ranks.length - 1];
            const prevRank = ranks[ranks.length - 2] ?? lastRank;

            const lastGrow = grows[grows.length - 1];
            const prevGrow = grows[grows.length - 2] ?? lastGrow;

            const rankDiff = lastRank - prevRank;
            const growDiff = lastGrow - prevGrow;
            const diffFromAvg = growDiff - avgDelta;

            const rankText = ranks.join(' → ');
            const growText = `${prevGrow} → ${lastGrow}`;

            notionTable += `| ${username} | ${rankText} | ${lastRank}位 | ${rankDiff >= 0 ? '+' : ''}${rankDiff} | ${growText} | +${growDiff} | ${diffFromAvg >= 0 ? '+' : ''}${diffFromAvg.toFixed(1)} |\n`;
          }

          await interaction.reply({
            content: '```markdown\n' + notionTable + '\n```',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        // 使い方ガイド（全員が利用可・エフェメラル表示）

}

module.exports = { tryHandleMotiAdminSlash };
