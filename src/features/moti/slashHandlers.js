// InteractionCreate から moti（スラッシュ/モーダル等）処理を分離するためのルーター
// ※メッセージ本文（返信文字列）は一切変更しない方針

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const { tryHandleMotiAdminSlash } = require('./adminSlashHandlers');

/**
 * moti 系の Interaction を処理します。
 * InteractionCreate 側で roles を先に処理した後に呼び出してください。
 *
 * @param {import('discord.js').Interaction} interaction
 * @param {object} ctx
 */
async function handleMotiSlash(interaction, ctx) {
  const {
    client,
    CURRENT_SEASON,
    MOTI_NOTICE_CHANNEL_ID,
    appendRecord,
    getRecordsByUser,
    getAllRecords,
    appendMonthlyRecord,
    getAllMonthlyRecords,
    getMonthlyRecordsByUser,
    runMonthlyDmReminder,
    buildSeasonSummaryForUser,
  } = ctx;

     // 追加：どのスラッシュコマンドが呼ばれたかをログに出す
    if (interaction.isChatInputCommand()) {
      console.log(`[Slash] /${interaction.commandName} from ${interaction.user.tag} (${interaction.user.id})`);
    }


      // ===== スラッシュコマンド =====
      if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        // 共通: season / seasonLabel（/moti_input 以外で使う）
        const optionSeason = interaction.options.getString('season');
        const season = optionSeason || CURRENT_SEASON;
        const seasonLabel = season || '全期間';

        if (await tryHandleMotiAdminSlash(interaction, ctx, { season, seasonLabel })) return;


       if (commandName === 'moti_input') {
    const modal = new ModalBuilder()
      .setCustomId('motiInputModal') // シーズンは customId ではなくフィールドで持つ
      .setTitle('モチベ記録入力');

    // シーズン入力欄
    const seasonInput = new TextInputBuilder()
      .setCustomId('season')
      .setLabel('対象シーズン（例: S35）※空欄なら現在シーズン')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('S35');

    // 順位
    const rankInput = new TextInputBuilder()
      .setCustomId('rank')
      .setLabel('現在の順位（数字のみ）')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('例: 3');

    // 育成数
    const growInput = new TextInputBuilder()
      .setCustomId('grow')
      .setLabel('現在の育成数（数字のみ）')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('例: 120');

    modal.addComponents(
      new ActionRowBuilder().addComponents(seasonInput),
      new ActionRowBuilder().addComponents(rankInput),
      new ActionRowBuilder().addComponents(growInput),
    );

    try {
      await interaction.showModal(modal);
    } catch (err) {
      console.error('moti_input showModal error:', err);

      // すでにどこかで応答済み（40060/10062）の場合は無視して終了
      if (err.code === 40060 || err.code === 10062) {
        return;
      }

      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({
            content: 'モチベ記録入力モーダルの表示中にエラーが発生しました。時間をおいて再度お試しください。',
            flags: MessageFlags.Ephemeral,
          });
        } catch (e) {
          console.error('moti_input error reply failed:', e);
        }
      }
    }
    return;
  }


              // ---------- /moti_month_input → 月間モチベ入力モーダル ----------
        if (commandName === 'moti_month_input') {
    const modal = new ModalBuilder()
      .setCustomId('motiMonthInputModal')
      .setTitle('月間モチベ調査');

    const monthInput = new TextInputBuilder()
      .setCustomId('monthKey')
      .setLabel('対象月（例: 2025-11）※空欄なら今月')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('2025-11');

    const growInput = new TextInputBuilder()
      .setCustomId('grow')
      .setLabel('現在の育成数（累計）')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('例: 1200');

    const fansInput = new TextInputBuilder()
      .setCustomId('fans')
      .setLabel('今月増えたファン数')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('例: 50000');

    modal.addComponents(
      new ActionRowBuilder().addComponents(monthInput),
      new ActionRowBuilder().addComponents(growInput),
      new ActionRowBuilder().addComponents(fansInput),
    );

    try {
      await interaction.showModal(modal);
    } catch (err) {
      console.error('moti_month_input showModal error:', err);

      // すでにどこかで応答済み（40060/10062）なら黙って終了
      if (err.code === 40060 || err.code === 10062) {
        return;
      }

      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({
            content: '月間モチベ調査モーダルの表示中にエラーが発生しました。時間をおいて再度お試しください。',
            flags: MessageFlags.Ephemeral,
          });
        } catch (e) {
          console.error('moti_month_input error reply failed:', e);
        }
      }
    }
    return;
  }


                  // /moti_me → 自分の推移
        if (commandName === 'moti_me') {
          const userId = interaction.user.id;
          const myRecords = await getRecordsByUser(userId, season);

          if (!myRecords.length) {
            await interaction.reply({
              content: `${seasonLabel} の記録がまだありません。/moti_input で記録を追加してください。`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          myRecords.sort((a, b) => a.timestamp - b.timestamp);
          const latest = myRecords.slice(-10);
          const rankHistory = latest.map((r) => r.rank);
          const growHistory = latest.map((r) => r.grow);

          const lastRank = rankHistory[rankHistory.length - 1];
          const prevRank = rankHistory[rankHistory.length - 2] ?? lastRank;

          const lastGrow = growHistory[growHistory.length - 1];
          const prevGrow = growHistory[growHistory.length - 2] ?? lastGrow;

          const rankDiff = lastRank - prevRank;
          const growDiff = lastGrow - prevGrow;

          // サークル平均（同シーズン・直近2回分の増加量）
          const allRecords = await getAllRecords(season);
          const byUser = new Map();
          for (const r of allRecords) {
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

          const diffFromAvg = growDiff - avgDelta;

          const growMark =
            diffFromAvg > 0 ? '🟢' :
            diffFromAvg < 0 ? '🔻' :
            '➖';

          const embed = new EmbedBuilder()
            .setTitle(`📊 ${seasonLabel} の ${interaction.user.username} さんの成績推移`)
            .setDescription('最新10回分の記録です。')
            .setColor(0xff4d4d)
            .addFields(
              {
                name: '順位推移',
                value:
                  `${rankHistory.join(' → ')}\n` +
                  `直近変化: ${rankDiff >= 0 ? '+' : ''}${rankDiff}`,
              },
              {
                name: '育成数推移',
                value:
                  `${prevGrow} → ${lastGrow}\n` +
                  `直近増加: +${growDiff}（サークル平均 +${avgDelta.toFixed(1)}）${growMark}`,
              },
            );

          await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

              // ---------- /moti_month_me → 月間モチベ推移 ----------
        if (commandName === 'moti_month_me') {
          const user = interaction.user;
          const userId = user.id;

          const myRecords = await getMonthlyRecordsByUser(userId);

          if (!myRecords.length) {
            await interaction.reply({
              content: 'まだ月間モチベ調査の記録がありません。`/moti_month_input` で今月の記録を追加してください。',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          // 直近6ヶ月ぶんを取得（古い順）
          myRecords.sort((a, b) => {
            if (a.monthKey === b.monthKey) {
              return (a.timestamp || 0) - (b.timestamp || 0);
            }
            return String(a.monthKey).localeCompare(String(b.monthKey));
          });
          const latest = myRecords.slice(-6);

          // 月別のサークル平均を計算
          const allRecords = await getAllMonthlyRecords();
          const byMonth = new Map();
          for (const r of allRecords) {
            if (!r.monthKey) continue;
            if (!byMonth.has(r.monthKey)) {
              byMonth.set(r.monthKey, { totalGrow: 0, count: 0 });
            }
            const bucket = byMonth.get(r.monthKey);
            bucket.totalGrow += r.grow;
            bucket.count += 1;
          }

          const lines = latest.map((r) => {
            const bucket = byMonth.get(r.monthKey);
            const avgGrow = bucket && bucket.count
              ? bucket.totalGrow / bucket.count
              : r.grow;

            const diff = r.grow - avgGrow;
            const mark =
              diff > 0 ? '🟢' :
              diff < 0 ? '🔻' :
              '➖';

            const diffText = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}`;

            return `・${r.monthKey}｜育成 ${r.grow}（平均 ${avgGrow.toFixed(1)} / 差分 ${diffText}）${mark}｜ファン +${r.fans}`;
          });

          const embed = new EmbedBuilder()
            .setTitle(`📅 ${user.username} さんの月間モチベ推移`)
            .setColor(0x22c55e)
            .setDescription([
              '直近6ヶ月ぶんの「月間モチベ調査」の記録です。',
              '育成数はその月の増加分、ファン数はその月に増えたファン数の目安です。',
              '',
              ...lines,
            ].join('\n'));

          await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

              // /moti_summary → 直近5シーズンのシーズン別まとめ
        if (commandName === 'moti_summary') {
          const user = interaction.user;
          const summary = await buildSeasonSummaryForUser(user.id, user.username, 5);

          if (!summary) {
            await interaction.reply({
              content: 'まだ記録がありません。/moti_input で記録を追加してください。',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const embed = new EmbedBuilder()
            .setTitle(summary.title + '（直近5シーズン）')
            .setDescription(summary.description)
            .setColor(0x22c55e);

          // 1024文字制限を考慮して分割
          let current = '';
          const fields = [];

          for (const line of summary.lines.slice(-5)) {
            const block = (current ? '\n\n' : '') + line;
            if ((current + block).length > 1024) {
              fields.push(current);
              current = line;
            } else {
              current += block;
            }
          }
          if (current) fields.push(current);

          fields.forEach((value, index) => {
            embed.addFields({
              name: index === 0 ? 'シーズン別サマリー' : '\u200b',
              value,
            });
          });

          await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        // /moti_summary_all → 全シーズンのシーズン別まとめ
        if (commandName === 'moti_summary_all') {
          const user = interaction.user;
          const summary = await buildSeasonSummaryForUser(user.id, user.username, null);

          if (!summary) {
            await interaction.reply({
              content: 'まだ記録がありません。/moti_input で記録を追加してください。',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const embed = new EmbedBuilder()
            .setTitle(summary.title + '（全期間）')
            .setDescription(summary.description)
            .setColor(0x6366f1);

          // 文字数制限を考慮して分割
          let current = '';
          const fields = [];

          for (const line of summary.lines) {
            const block = (current ? '\n\n' : '') + line;
            if ((current + block).length > 1024) {
              fields.push(current);
              current = line;
            } else {
              current += block;
            }
          }
          if (current) fields.push(current);

          fields.forEach((value, index) => {
            embed.addFields({
              name: index === 0 ? 'シーズン別サマリー' : '\u200b',
              value,
            });
          });

          await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        // 使い方ガイド（全員が利用可・エフェメラル表示）
        if (commandName === 'moti_help') {
          const embed = new EmbedBuilder()
            .setTitle('📘 成績通知表システムの使い方')
            .setColor(0x3b82f6)
            .setDescription([
              'このシステムは、',
              '・コンテスト「シーズン」ごとの成績',
              '・月ごとのモチベーション（育成数・ファン数）',
              'を記録・振り返りするためのものです。',
              '',
              'まずは `/moti_month_input` で月ごとの成績を、',
              '必要に応じて `/moti_input` でコンテスト成績を記録してください。',
            ].join('\n'))
            .addFields(
              {
                name: '🧩 シーズン記録（コンテスト用）',
                value: [
                  '**`/moti_input` – 成績の登録**',
                  '∥ その時点の順位と育成数を 1 回分だけ記録します。',
                  '∥ 入力項目：',
                  '　・対象シーズン（任意）… `S35` など。',
                  '　・現在の順位 … 数字のみ',
                  '　・現在の育成数 … 数字のみ（その時点での累計育成回数）',
                  '',
                  '**`/moti_me` – 直近10件の推移**',
                  '∥ 自分の最新10件の記録から、順位と育成数の推移を表示します。',
                  '∥ 育成数には、サークル平均の増加量との比較が付きます。',
                  '',
                  '**`/moti_summary` – 直近シーズンまとめ**',
                  '∥ 直近のシーズンごとに「どれくらい育成したか」を一覧で表示します。',
                  '',
                  '**`/moti_summary_all` – 全シーズンまとめ**',
                  '∥ これまでの全シーズンについて、シーズンごとの増加数を一覧表示します。',
                ].join('\n'),
              },
              {
                name: '📅 月間モチベ調査（提出必須）',
                value: [
                  '**`/moti_month_input` – 月間モチベの記録**',
                  '∥ 「1ヶ月でどれくらい育成したか」「どれくらいファンが増えたか」を記録します。',
                  '∥ 入力項目：',
                  '　・対象月（任意）… `2025-11` など。空欄なら今月として記録',
                  '　・今月の育成数 … 現在の総育成数を入力(差分を自動で増加分として計算してくれます)',
                  '　・今月のファン数 … 現在の総ファン数を入力(差分を自動で増加分として計算してくれます)',
                  '',
                  '**`/moti_month_me` – 月間モチベの推移**',
                  '∥ 直近6ヶ月分の月間記録を一覧表示します。',
                  '∥ 育成数について、「サークル平均」との差分が 🟢 / 🔻 / ➖ で表示されます。',
                ].join('\n'),
              },
              {
                name: '🛠 運営専用コマンド（ManageGuild 権限のみ）',
                value: [
                  '**`/moti_report` – サークル全体レポート**',
                  '∥ 指定シーズンの全メンバーについて、直近の順位推移・育成数の増加・サークル平均との差をまとめて表示します。',
                  '',
                  '**`/moti_notion` – Notion 用サマリー表**',
                  '∥ Notion に貼り付けやすいテーブル形式で、シーズンごとの成績を出力します。',
                ].join('\n'),
              },
            );

         await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral, // 自分にだけ見える
          });
          return;
        }
      } // ★ ここで isChatInputCommand() ブロックを閉じる



  return;
}

module.exports = { handleMotiSlash };
