// InteractionCreate から moti（スラッシュ/モーダル等）処理を分離するためのモーダルハンドラー
// ※メッセージ本文（返信文字列）は一切変更しない方針

const { MessageFlags } = require('discord.js');

/**
 * moti 系のモーダル送信（submit）を処理します。
 * @param {import('discord.js').Interaction} interaction
 * @param {object} ctx
 */
async function handleMotiModalSubmit(interaction, ctx) {
  const {
    CURRENT_SEASON,
    appendRecord,
    appendMonthlyRecord,
    getMonthlyRecordsByUser,
  } = ctx;

             // ===== モーダル送信（/moti_input のフォーム） =====
      if (interaction.isModalSubmit() && interaction.customId === 'motiInputModal') {
        console.log(`[Modal] motiInputModal submit from ${interaction.user.tag} (${interaction.user.id})`);

        try {
          // ★ まず deferReply で「あとで返事します」と伝える（3秒制限を回避）
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          const rawSeason = interaction.fields.getTextInputValue('season').trim();
          const rankText  = interaction.fields.getTextInputValue('rank').trim();
          const growText  = interaction.fields.getTextInputValue('grow').trim();

          const rank = parseInt(rankText, 10);
          const grow = parseInt(growText, 10);

          if (Number.isNaN(rank) || Number.isNaN(grow)) {
            await interaction.editReply({
              content: '順位と育成数は数字で入力してください。',
            });
            return;
          }

          // シーズンはフォーム優先／空欄なら CURRENT_SEASON
          const season = rawSeason || CURRENT_SEASON;
          if (!season) {
            await interaction.editReply({
              content: 'シーズンが空欄です。コマンドの season またはフォームのいずれかに入力してください。',
            });
            return;
          }

          // スプレッドシートに記録
          await appendRecord(
            interaction.user.id,
            interaction.user.username || interaction.user.tag,
            rank,
            grow,
            season,
          );

          await interaction.editReply({
            content: [
              '✅ 記録を保存しました。',
              `シーズン: ${season}`,
              `順位: ${rank}`,
              `育成数: ${grow}`,
            ].join('\n'),
          });
          return;
        } catch (err) {
          console.error('motiInputModal submit error:', err);

          try {
            if (interaction.deferred || interaction.replied) {
              await interaction.editReply({
                content: '記録の保存中にエラーが発生しました。時間をおいて再度お試しください。',
              });
            } else {
              await interaction.reply({
                content: '記録の保存中にエラーが発生しました。時間をおいて再度お試しください。',
                flags: MessageFlags.Ephemeral,
              });
            }
          } catch (e) {
            console.error('motiInputModal error reply failed:', e);
          }
          return;
        }
      }

      // ===== モーダル送信（/moti_month_input のフォーム） =====
      if (interaction.isModalSubmit() && interaction.customId === 'motiMonthInputModal') {
        console.log(`[Modal] motiMonthInputModal submit from ${interaction.user.tag} (${interaction.user.id})`);

        try {
          // ★ こちらも deferReply を必ず最初に
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          const rawMonth  = interaction.fields.getTextInputValue('monthKey').trim();
          const totalText = interaction.fields.getTextInputValue('grow').trim(); // 現在の累計育成数
          const fansText  = interaction.fields.getTextInputValue('fans').trim();

          const currentTotal = parseInt(totalText, 10);
          const fans         = parseInt(fansText, 10);

          if (Number.isNaN(currentTotal) || Number.isNaN(fans)) {
            await interaction.editReply({
              content: '数字を入力してください。',
            });
            return;
          }

          // monthKey の正規化（YYYY-MM に寄せる）
          let monthKey = '';
          if (rawMonth) {
            const normalized = rawMonth.replace(/[./]/g, '-');
            const m = normalized.match(/^(\d{4})-?(\d{1,2})$/);
            if (m) {
              const year  = m[1];
              const month = String(Number(m[2])).padStart(2, '0');
              monthKey = `${year}-${month}`;
            }
          }
          // 入力がなければ今月
          if (!monthKey) {
            monthKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"
          }

          const userId   = interaction.user.id;
          const username = interaction.user.username || interaction.user.tag;

          // これまでの「月間増加分」レコードを取得
          const myMonthlyRecords = await getMonthlyRecordsByUser(userId);

          // すでに同じ月の記録があればエラーにする
          const already = myMonthlyRecords.find((r) => r.monthKey === monthKey);
          if (already) {
            await interaction.editReply({
              content: `対象月 ${monthKey} の記録はすでに登録されています。修正が必要な場合は、運営までご連絡ください。`,
            });
            return;
          }

          // これまでの「増加分（grow）」の合計 = いままでの累計育成数
          const previousTotal = myMonthlyRecords.reduce(
            (sum, r) => sum + (r.grow || 0),
            0,
          );

          const diff = currentTotal - previousTotal;

          if (diff < 0) {
            await interaction.editReply({
              content: [
                '現在の育成数（累計）が、これまでの記録の合計より小さくなっています。',
                '入力値をご確認ください。',
              ].join('\n'),
            });
            return;
          }

          // 保存するのは「今月の増加分（diff）」のまま
          await appendMonthlyRecord(
            userId,
            username,
            diff,
            fans,
            monthKey,
          );

          await interaction.editReply({
            content: [
              '✅ 月間モチベを記録しました。',
              `対象月: ${monthKey}`,
              `今月の育成数（増加分）: ${diff}`,
              `現在の累計育成数: ${currentTotal}`,
              `ファン数: ${fans}`,
            ].join('\n'),
          });
          return;
        } catch (err) {
          console.error('motiMonthInputModal submit error:', err);

          try {
            if (interaction.deferred || interaction.replied) {
              await interaction.editReply({
                content: '月間モチベの記録中にエラーが発生しました。時間をおいて再度お試しください。',
              });
            } else {
              await interaction.reply({
                content: '月間モチベの記録中にエラーが発生しました。時間をおいて再度お試しください。',
                flags: MessageFlags.Ephemeral,
              });
            }
          } catch (e) {
            console.error('motiMonthInputModal error reply failed:', e);
          }
           return;
        }
      }

    

  return;
}

module.exports = { handleMotiModalSubmit };
