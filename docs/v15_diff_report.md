# CircleBot v15 リファクタ 差分レポート（Step1〜Step7）

> 方針（遵守）
> - 起動が落ちない設計（processGuards / health）
> - **本文（返信文・Embed文言等）は変更しない**
> - サーバー移行しやすい（IDは config/env で差し替え）
> - ジャンルごとに整理（roles / vc / moti）
> - 将来拡張前提

---

## 1) 入口（Events）の整理

### 追加
- `src/events/interactionCreate.js`
  - InteractionCreate の入口をここに固定
  - roles / moti の router を順に呼ぶ “入口” に整理

- `src/events/voiceStateUpdate.js`
  - VC監視（VoiceStateUpdate）の入口をここに固定
  - `src/features/vc/vcMonitor.js` を呼ぶ配線に整理

### 目的
- bot.js 直書きの巨大イベントを避け、今後の追加機能も `src/events/` 配下で管理できる状態にする。

---

## 2) roles（ロール付与）

### 追加
- `src/features/roles/interactionRouter.js`
  - ボタンIDの判定〜 `roleButtonHandler` 呼び出しまでの “薄い入口”

### 変更
- `src/features/roles/roleButtonHandler.js`
  - 「ボタンを押したユーザーに Manage Roles を要求」から、
    「Bot側の権限 + ロール階層的に操作可能（role.editable）」を優先する形に修正
  - ※返信文言は据え置き（ロジックのみ安全側に）

---

## 3) vc（VC監視・通知）

### 追加/整理
- `src/features/vc/vcMonitor.js`（VC監視本体）
  - VC開始/終了通知、人数変化、チャンネル名変更、オンライン音（オプション）等を集約
  - 入口は `src/events/voiceStateUpdate.js` から呼ぶ

---

## 4) moti（コマンド/モーダル/スケジューラ）

### 追加
- `src/features/moti/interactionRouter.js`
  - moti系 Interaction の入口（router）
- `src/features/moti/slashHandlers.js`
  - /moti_* 系コマンドの処理を集約
- `src/features/moti/modalHandlers.js`
  - moti系モーダル submit の処理を集約
- `src/features/moti/adminSlashHandlers.js`
  - 運営専用コマンド（report/notion/season_close 等）を分離

### 既存（整理済）
- `src/features/moti/scheduler.js`
  - cron集約＋二重登録防止
- `src/features/moti/monthlyDmReminder.js`
  - 月次DM送信の本体、env未設定時のログ投稿スキップ等

---

## 5) bot.js の責務（“入口として残しつつ分割”）

### 変更方針
- `node bot.js` を起点に維持しつつ、以下を “登録呼び出し” へ寄せた
  - core（processGuards/health）初期化
  - events 登録（InteractionCreate / VoiceStateUpdate）
  - scheduler 起動（ready時に呼ぶ）

---

## 6) 移行・差し替えポイント

- サーバー固有IDは `src/config/servers/*.json` / `.env` で差し替え前提
- VCオンライン音などのオプションは env（例：`VC_PLAY_ONLINE_SOUND`）で制御

---

## 7) 片付け（削除候補）

> ※削除は“動作確認後に”実施推奨。差分ZIPでは削除を強制しない。

- 旧構成の `data/`, 旧 `features/`（src外）などが残っていれば整理対象
- 使っていない単発送信用ファイル（例：`sendEmbed.js` 等）が残っていれば整理対象
- 空の `src/utils/`, 未使用の `src/constants/texts.js`（空ファイル等）があれば整理対象

---

## 8) 変更の性質

- 目的：**構造（配線・分割）を整えること**
- 影響：機能の表面挙動は維持（本文変更なし）
- リスク：同時起動（ローカル+Render等）による二重発火は運用で回避（既知）
