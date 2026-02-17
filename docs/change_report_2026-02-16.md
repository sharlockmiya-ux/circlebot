# Change Report (2026-02-16)

## 追加したもの

- Pythonデスクトップアプリ一式: `desktop_app/`
  - GUI: `desktop_app/app/ui_main.py`
  - 自動周回ワーカー: `desktop_app/app/automation_worker.py`
  - ROI/テンプレ登録UI部品: `desktop_app/app/selection_widgets.py`
  - テンプレマッチ: `desktop_app/app/template_matcher.py`
  - 通知クライアント: `desktop_app/app/notifier.py`
  - 保存ストア抽象/実装: `desktop_app/app/stores.py`
  - 設定管理: `desktop_app/app/settings.py`
  - 起動: `desktop_app/main.py`
  - 依存: `desktop_app/requirements.txt`
  - ドキュメント: `desktop_app/README.md`
  - デフォルト設定: `desktop_app/config/default_settings.json`
  - 初期設定: `desktop_app/config/settings.json`
- Bot通知機能:
  - `src/features/notify/httpNotifyHandler.js`
  - `docs/notify_integration.md`

## 変更したもの

- `src/core/healthServer.js`
  - `POST /notify` の分岐を追加
  - それ以外のパスは従来どおり `200 OK`
- `bot.js`
  - dotenv読み込み順序の調整
  - notify handler の組み込み
  - Discord client を notify handler から参照可能に変更
- `src/config/servers/main.json`
  - `notify.dmUserId` を追加（空値、env fallback対応）

## 触っていない主要機能

- moti / roles / vc / embed / xGoodsNotifier の既存ロジック本体
- slashコマンド本文や既存Embed本文
- エントリポイント `bot.js` の運用形態（`node bot.js`）
- `package.json` の CommonJS / Node20 前提

