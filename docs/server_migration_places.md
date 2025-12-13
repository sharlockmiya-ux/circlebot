# CircleBot v15 サーバー移行で書き換える場所（まとめ）

このドキュメントは「サーバー（Guild）を移行したときに、どこを差し替えるべきか」を **場所ベース**で整理したものです。  
v15の方針（IDを1か所に集約）に合わせ、基本は **config と env** の2か所を触れば完了します。

---

## 1. 必ず見直す場所（最重要）

### A. `src/config/servers/main.json`（サーバー固有IDの集約先）
移行時に **ほぼ必ず差し替える**のはここです（新サーバーではIDが全部変わるため）。

- `guildId`  
  - 新サーバーの **Guild ID**
  - 用途：`https://discord.com/channels/<guildId>/<channelId>` のリンク生成など

- `channels.*`（チャンネルID）
  - `log`：botログ投稿先
  - `rolepanel`：ロールパネル設置先
  - `rulesSummary`：ルールまとめ等の案内先
  - `inquiry`：問い合わせ（チケット等）導線
  - `guide.*`：案内文で `<#...>` として表示する導線（自己紹介・雑談等）
  - `announce` / `vcTextNotify`：未使用なら空でOK（使うなら新IDへ）

- `roles.*`（ロールID）
  - `admin` / `subLeader` / `operator`：運営ロール等
  - `announcement`：お知らせロール
  - `engineer`：技術者ロールなど
  - `idols`：アイドル担当ロール一覧（多数）

- `messages.*`（メッセージID）
  - 例：`roleEmbedMessageId`  
  - 用途：**既存メッセージを編集する方式**のスクリプトで使用  
  - 注意：移行先サーバーには「同じメッセージ」が存在しないため、新規送信→新ID取得が必要になることが多い

- `assets.*`（任意）
  - VC通知音など、参照先を固定したい場合のパス/URL

---

### B. `.env`（秘密情報・環境依存）
移行により **変わることもある**ので確認します。  
（Renderを使う場合は、RenderのEnvironment Variablesも同様）

- `DISCORD_TOKEN`
  - 同じBotアプリを使うなら基本そのまま
  - Botを分けるならDiscord側で別アプリ→新TOKEN

- `ROLEPANEL_CHANNEL_ID`
  - oneoffスクリプトで env を参照する設計の場合に使用
  - config参照に統一しているなら未使用でもOK（プロジェクト仕様に合わせる）

- 外部連携（Google Sheets/Notion等）
  - `SPREADSHEET_ID` / サービスアカウント鍵 / Notionトークン等
  - 移行先で運用を変えるなら更新

---

## 2. Discord側（コード外）の必須作業

### C. Botを新サーバーへ招待
- OAuth2招待URLで招待
- Bot権限：ロール付与、メッセージ送信、VC監視など必要権限を付与

### D. ロール階層の確認（重要）
- Botのロールが、付与対象ロールより **上** にあること  
  （これが原因でロール付与が動かないケースが最も多い）

### E. Intent（必要な場合）
- VC監視等を使う場合、Discord Developer Portalで該当Intentが有効か確認

---

## 3. 移行後の動作チェック（最短）

### 1) 直書きIDが残っていないか（保険）
```powershell
node .\scripts\scanHardcodedIds.js
```

### 2) 起動
```powershell
node bot.js
```

### 3) 主要機能チェック
- roles：ロールボタン付与/解除
- vc：入退室が1回だけ反応（同時起動に注意）
- moti：主要コマンドが動く
- oneoff（必要なら）：
  - `node .\scripts\oneoff\sendEmbed.js role` 等

---

## 4. おすすめの運用（移行が多い/複数サーバーを扱う場合）

### ✅ 方法：`src/config/servers/` にサーバー別JSONを並べて切り替える
例：
- `src/config/servers/main.json`（本番）
- `src/config/servers/newserver.json`（移行先）
- `src/config/servers/test.json`（テスト用）

そして **どの設定を読むか**を 1か所で切り替える運用にします。

#### 切り替え方法（推奨）
- `.env`（またはRenderの環境変数）に、例えば：
  - `SERVER_CONFIG_NAME=main`
  - `SERVER_CONFIG_NAME=newserver`

- `src/config/index.js` で `SERVER_CONFIG_NAME` を読んで
  - `src/config/servers/<name>.json` をロードする

> こうしておくと、サーバー移行時は **JSONを追加するだけ**で済み、コード修正がほぼ不要になります。

---

## 5. よくある落とし穴（対策）
- **同一トークンで二重起動**（ローカル＋Render）  
  → Interaction 40060 等が出るので、必ず片方を停止
- メッセージID編集方式（`messages.*`）の継続  
  → 移行先で新規送信→新IDへ更新が必要
- Botロールの位置が低い  
  → ロール付与が失敗する

---
