// features/rolepanel.js
require('dotenv').config();
const {
  Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, Events, EmbedBuilder
} = require('discord.js');

// ===== ロール定義（そのまま）=====
const ROLE_BUTTONS = [
  { label: '花海咲季', roleId: '1433172645775409313', customId: 'role_hanamizaki' },
  { label: '月村手毬', roleId: '1433203573339979909', customId: 'role_tsukimura' },
  { label: '藤田ことね', roleId: '1433205808136589372', customId: 'role_fujita' },
  { label: '有村麻央', roleId: '1433206251923177513', customId: 'role_arimura' },
  { label: '葛城リーリヤ', roleId: '1433206385985847407', customId: 'role_katsuragi' },
  { label: '倉本千奈', roleId: '1433206519217918002', customId: 'role_kuramoto' },
  { label: '紫雲清夏', roleId: '1433206612281266316', customId: 'role_shiun' },
  { label: '篠澤広', roleId: '1433206721760854147', customId: 'role_shinozawa' },
  { label: '姫崎莉波', roleId: '1433206833891508284', customId: 'role_himezaki' },
  { label: '花海佑芽', roleId: '1433206978066382939', customId: 'role_hanamiyume' },
  { label: '秦谷美鈴', roleId: '1433207092449382523', customId: 'role_hataya' },
  { label: '十王星南', roleId: '1433207186749652992', customId: 'role_juuo' },
  { label: '雨夜燕', roleId: '1433207380010733769', customId: 'role_amayo' }
];

// ===== 一度だけ送る独立プロセス（既存 bot.js に非干渉）=====
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// .env 推奨：ROLEPANEL_CHANNEL_ID=xxxxxxxxxxxxxxxx
const CHANNEL_ID = process.env.ROLEPANEL_CHANNEL_ID || '1433146948499673088';

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log('ℹ️ 送信先チャンネルID:', CHANNEL_ID);

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);

    // ▼ 文面を「担当アイドル選択」に刷新（注意書きは見せない）
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎛️ 担当アイドル選択')
      .setDescription([
        '自分の担当アイドルを、下のボタンから選んでください。',
        '（もう一度押すと解除できます）'
      ].join('\n'));

    // ボタンを5個ずつ1行に並べる
    const rows = [];
    for (let i = 0; i < ROLE_BUTTONS.length; i += 5) {
      const slice = ROLE_BUTTONS.slice(i, i + 5);
      rows.push(new ActionRowBuilder().addComponents(
        slice.map(b => new ButtonBuilder()
          .setCustomId(b.customId)
          .setLabel(b.label)
          .setStyle(ButtonStyle.Primary))
      ));
    }

    await channel.send({ embeds: [embed], components: rows });
    console.log('✅ 担当アイドル選択パネル（Embed＋ボタン）を送信しました');
  } catch (err) {
    console.error('❌ チャンネル送信エラー:', err);
  }
});

// 押下時処理（注意文は出さない／権限エラー時のみユーザーに見せる）
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const def = ROLE_BUTTONS.find(r => r.customId === interaction.customId);
  if (!def) return;

  const me = await interaction.guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles))
    return interaction.reply({ content: '⚠️ Botに「ロールの管理」権限がありません。', ephemeral: true });

  const role = interaction.guild.roles.cache.get(def.roleId);
  if (!role)
    return interaction.reply({ content: '⚠️ ロールが見つかりません。', ephemeral: true });

  // ※ 並び順の注意は一般メンバーに見せない。必要時のみ管理者が見るログに出す。
  if (role.position >= me.roles.highest.position) {
    console.error('⚠️ 並び順エラー：Botロールが付与対象より下（サーバー設定でBotロールを上に）');
    return interaction.reply({ content: '⚠️ ただいま設定を更新中です。少し待ってから再度お試しください。', ephemeral: true });
  }

  const member = interaction.member;
  const has = member.roles.cache.has(role.id);

  try {
    if (has) {
      await member.roles.remove(role);
      await interaction.reply({ content: `✅ 「${role.name}」を解除しました。`, ephemeral: true });
    } else {
      await member.roles.add(role);
      await interaction.reply({ content: `✅ 「${role.name}」を付与しました。`, ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: '❌ ロール操作に失敗しました。時間をおいて再度お試しください。', ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);

