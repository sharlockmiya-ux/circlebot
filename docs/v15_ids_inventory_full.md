# v15 IDs Inventory（完全版）
このドキュメントは `src/config/servers/main.json` に集約した **Discord ID（Snowflake）** と、その用途（どこで参照されるか）を一覧化したものです。
## 参照ルール
- **IDの種別**：Guild（サーバー）/ Channel（チャンネル）/ Role（ロール）/ Message（メッセージ）
- **原則**：コード側に直書きせず `main.json` を参照する（サーバー移行を簡単にするため）。

## サーバー
| 設定キー | ID | 種別 | 指すもの | 主な利用箇所 |
|---|---:|---|---|---|
| `guildId` | `1431896098036781171` | Guild | メインサーバー（Guild） | bot.js のチャンネルURL生成（`https://discord.com/channels/<guild>/<channel>`） |

## チャンネル
| 設定キー | ID | 種別 | 指すもの | 主な利用箇所 |
|---|---:|---|---|---|
| `channels.log` | `1431975383242113066` | Channel | ログ出力先（Bot運用ログ） | moti月次DMの送信ログなど（機能側が参照する設計） |
| `channels.rolepanel` | `1433797341642489936` | Channel | ロールパネル設置チャンネル | scripts/oneoff/sendEmbed.js・sendIdolRolePanel.js・sendAnnouncementRole.js、scripts/editRoleEmbed.js |
| `channels.announce` | `` | Channel | （未設定）お知らせ投稿先 | 未使用（必要になったら設定） |
| `channels.vcTextNotify` | `` | Channel | （未設定）VC開始/終了の通知先 | 未使用（必要になったら設定） |
| `channels.rulesSummary` | `1431904100081205268` | Channel | ルール等まとめの案内先チャンネル | bot.js の案内/まとめ投稿（CHANNEL_IDのfallback） |
| `channels.inquiry` | `1433797414598479922` | Channel | お問い合わせ（窓口）チャンネル | bot.js の案内リンク生成（#お問い合わせ） |

### channels.guide（案内Embed内で `<#...>` として表示するリンク先）
| 設定キー | ID | 種別 | 指すもの（案内上のカテゴリ） | 主な利用箇所 |
|---|---:|---|---|---|
| `channels.guide.newMemberNotify` | `1431896098674577459` | Channel | 新規加入者向け通知/導線 | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.selfIntro` | `1431903913833009253` | Channel | 自己紹介 | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.contact` | `1431896098674577460` | Channel | 連絡/アナウンス | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.gakumasChat` | `1431902505209696256` | Channel | 学マス雑談 | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.evaluationStrategy` | `1431902551124742205` | Channel | 評価/攻略 | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.formationShare` | `1431902589590704129` | Channel | 編成共有 | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.reportCard` | `1431902622318596167` | Channel | 成績/振り返り | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.contestChat` | `1431902822953385984` | Channel | コンテスト | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.scoreTool` | `1432388076256231516` | Channel | スコアツール/外部ツール | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.simulationShare` | `1431902969795706941` | Channel | シミュ共有 | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.produceFormationShare` | `1431902996060700813` | Channel | プロデュース編成共有 | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.rehearsalAveShare` | `1431903020517425332` | Channel | （リハ/平均など）共有 | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.voiceChat` | `1431901093612486738` | Channel | ボイスチャット導線 | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.botSettings` | `1431901117205319742` | Channel | Bot設定/案内 | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.freeTalk` | `1431903789853708338` | Channel | 雑談 | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.otherGames` | `1431903815946211338` | Channel | 他ゲーム | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.foodTalk` | `1431903867947319336` | Channel | 食べ物雑談 | bot.js の案内Embed（チャンネル一覧） |
| `channels.guide.memoArchive` | `1432335666959745044` | Channel | メモ保管庫 | bot.js の案内Embed（チャンネル一覧） |

## ロール
| 設定キー | ID | 種別 | 指すもの | 主な利用箇所 |
|---|---:|---|---|---|
| `roles.announcement` | `1435924112160587856` | Role | お知らせ🔔ロール | scripts/oneoff/sendAnnouncementRole.js（role_on/offボタンに埋め込む） |
| `roles.engineer` | `1435677519075610634` | Role | 技術者ロール | scripts/editRoleEmbed.js（既存ロール紹介Embedの記述に使用） |
| `roles.admin` | `1434074658059190343` | Role | 運営ロール（最高管理） | scripts/oneoff/sendEmbed.js（運営ロール紹介文のメンション） |
| `roles.subLeader` | `1432727570419548323` | Role | リーダー代理ロール | scripts/oneoff/sendEmbed.js（運営ロール紹介文のメンション） |
| `roles.operator` | `1431975448119607316` | Role | 参謀/業務遂行者ロール | scripts/oneoff/sendEmbed.js（運営ロール紹介文のメンション）、scripts/editRoleEmbed.js（アンカー） |

### roles.idols（アイドル担当ロール）
`roles.idols` は **ボタンロール付与** と **アイドルロールパネル送信** の両方で使います。`customId` はボタン識別子で、Discord側のロールIDではありません。
| label | roleId | customId | 種別 | 主な利用箇所 |
|---|---:|---|---|---|
| 花海咲季 | `1433209432581341305` | `role_hanamizaki` | Role | bot.js（ロールボタン処理）、scripts/oneoff/sendIdolRolePanel.js |
| 月村手毬 | `1433331636514062447` | `role_tsukimura` | Role | bot.js（ロールボタン処理）、scripts/oneoff/sendIdolRolePanel.js |
| 藤田ことね | `1433332410623328398` | `role_fujita` | Role | bot.js（ロールボタン処理）、scripts/oneoff/sendIdolRolePanel.js |
| 有村麻央 | `1433332920667476068` | `role_arimura` | Role | bot.js（ロールボタン処理）、scripts/oneoff/sendIdolRolePanel.js |
| 葛城リーリヤ | `1433333171453169794` | `role_katsuragi` | Role | bot.js（ロールボタン処理）、scripts/oneoff/sendIdolRolePanel.js |
| 倉本千奈 | `1433333415947669534` | `role_kuramoto` | Role | bot.js（ロールボタン処理）、scripts/oneoff/sendIdolRolePanel.js |
| 紫雲清夏 | `1433333595694563429` | `role_shiun` | Role | bot.js（ロールボタン処理）、scripts/oneoff/sendIdolRolePanel.js |
| 篠澤広 | `1433333784270606428` | `role_shinozawa` | Role | bot.js（ロールボタン処理）、scripts/oneoff/sendIdolRolePanel.js |
| 姫崎莉波 | `1433333959378604104` | `role_himezaki` | Role | bot.js（ロールボタン処理）、scripts/oneoff/sendIdolRolePanel.js |
| 花海佑芽 | `1433334170721189989` | `role_hanamiyume` | Role | bot.js（ロールボタン処理）、scripts/oneoff/sendIdolRolePanel.js |
| 秦谷美鈴 | `1433334387252138015` | `role_hataya` | Role | bot.js（ロールボタン処理）、scripts/oneoff/sendIdolRolePanel.js |
| 十王星南 | `1433334591179063316` | `role_juuo` | Role | bot.js（ロールボタン処理）、scripts/oneoff/sendIdolRolePanel.js |
| 雨夜燕 | `1433334807441702952` | `role_amayo` | Role | bot.js（ロールボタン処理）、scripts/oneoff/sendIdolRolePanel.js |

## メッセージ
| 設定キー | ID | 種別 | 指すもの | 主な利用箇所 |
|---|---:|---|---|---|
| `messages.roleEmbedMessageId` | `1434168544097996912` | Message | 既存のロール紹介Embedメッセージ（編集対象） | scripts/editRoleEmbed.js（メッセージ取得→Embed編集→上書き） |

## アセット
| 設定キー | 値 | 種別 | 指すもの | 主な利用箇所 |
|---|---|---|---|---|
| `assets.onlineMp3` | `assets/sounds/online.mp3` | Path | VC開始時に再生する音声ファイル（onlineメッセージ） | VC機能（vcMonitor 等。参照する設計） |

## 空欄（未設定）について
- `channels.announce` / `channels.vcTextNotify` が空文字の場合、そこを参照する機能は **送信をスキップ**する想定です。
- 今後、運用で必要になった時点で `main.json` の該当キーにIDを入れれば反映されます。
