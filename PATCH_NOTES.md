# xGoods notifier patch (v4: 読み取り最小化)

このパッチは **X API の読み取り（返ってくる投稿数）を最小化** する調整です。

## 何が変わる？
- cron（毎朝06:35 JST）の取得は **max_results を小さく** し、
  さらに **since_id（前回見えた最新ツイートID）** を使って差分取得します。
  - これにより、通常は「新しい1件」程度の読み取りで済みます。
- 手動テスト（/xgoods test）は、cron よりは広めに読むものの、
  それでも `testMaxResults` の範囲に制限します。

## 追加・変更ファイル
- `src/features/xGoodsNotifier/notifier.js`（差分取得 + readBudget）
- `src/features/xGoodsNotifier/xApi.js`（since_id 対応）
- `src/features/xGoodsNotifier/stateStore.js`（lastSeenTweetId 等を保存）
- `src/features/xGoodsNotifier/config.js`（cron/test の maxResults を分離）
- `src/features/xGoodsNotifier/interactionRouter.js`（/xgoods status 表示強化）
- `src/features/xGoodsNotifier/matcher.js`（「業務連絡」必須の判定を維持）
- `src/config/servers/main.json`（xGoodsNotifier 設定更新）

## 設定（main.json）
`xGoodsNotifier` に以下を追加しました。
- `cronMaxResults`: 5（自動実行の読み取り件数）
- `testMaxResults`: 25（手動テストの読み取り件数）
- `excludeReplies`: true（返信を除外）

## /xgoods test が no_candidate になる場合
読み取り最小化の都合で、手動テストが「直近の投稿だけ」を見てしまい、
**朝6:30の投稿が古くなっていると拾えない** ことがあります。
その場合は **朝06:35の自動通知で拾えることを優先**してください。
（どうしても深掘りしたい場合は `testMaxResults` を一時的に増やして再テスト。）
