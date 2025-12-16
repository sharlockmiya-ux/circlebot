// Embed builder templates (presets)
// CommonJS / discord.js v14

/**
 * UIで表示するテンプレ一覧
 * - id: draft.templateId / select value
 * - label: セレクトの表示
 * - description: セレクトの説明（任意）
 */
const EMBED_TEMPLATES = [
  {
    id: 'notice_basic',
    label: 'お知らせ（基本）',
    description: '告知・連絡用のベース',
  },
  {
    id: 'role_guide_basic',
    label: 'ロール案内（基本）',
    description: 'ロール付与/説明のベース',
  },
  {
    id: 'event_basic',
    label: 'イベント告知（基本）',
    description: '日時/場所/参加方法つき',
  },
];

function getTemplateDraft(templateId) {
  switch (templateId) {
    case 'notice_basic':
      return {
        title: 'お知らせ',
        description: 'ここに本文を入力してください。\n\n（必要なら追記してOK）',
        color: 0x3498db, // blue
        fields: [
          { name: '概要', value: 'ここに要点', inline: false },
          { name: '詳細', value: 'ここに詳細', inline: false },
        ],
      };

    case 'role_guide_basic':
      return {
        title: 'ロール案内',
        description: 'このメッセージのボタン/セレクトからロールを付与できます。\n\n必要なロールを選択してください。',
        color: 0x2ecc71, // green
        fields: [
          { name: '使い方', value: 'ボタン/セレクトを押すとロールが付与/解除されます。', inline: false },
        ],
      };

    case 'event_basic':
      return {
        title: 'イベント告知',
        description: 'イベントの概要をここに入力してください。',
        color: 0x9b59b6, // purple
        fields: [
          { name: '日時', value: '未定', inline: true },
          { name: '場所', value: '未定', inline: true },
          { name: '参加方法', value: '未定', inline: false },
        ],
      };

    default:
      return null;
  }
}

module.exports = {
  EMBED_TEMPLATES,
  getTemplateDraft,
};
