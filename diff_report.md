# 差分レポート: 429レートリミット対策

## 変更ファイル一覧

### 1. `bot.js`

#### 変更箇所A: rateLimitedイベントリスナー追加（L451付近）
- **種別**: 追加
- **内容**: `client.rest.on('rateLimited', ...)` を Client生成直後に追加
- **目的**: discord.jsが検知したレートリミット情報（retryAfter, global, url）をRenderログに出力
- **本文変更**: なし

#### 変更箇所B: ping()関数のRetry-After表示 + 呼び出し無効化（L115, L138-146付近）
- **種別**: 変更
- **内容**:
  - ping()でHTTP 429時に`Retry-After`ヘッダーをログ出力するよう改善
  - **起動時の2つのping()呼び出しをコメントアウト**（discord.js管理外のリクエストが429ペナルティをエスカレートさせるため）
- **理由**: ping()はdiscord.jsのレートリミットキューを通らず、429中に飛ぶとDiscord側がペナルティ時間を延長する（実測: 323秒→2644秒に悪化）
- **本文変更**: なし

#### 変更箇所C: loginバックオフリトライ（末尾）
- **種別**: 変更
- **内容**: `client.login(TOKEN).catch(...)` → 最大3回リトライ（30秒/60秒/90秒間隔）のバックオフ付きIIFEに変更
- **目的**: 429でlogin失敗した際、即座にプロセスがクラッシュ→Render再起動→再度429のループを防止
- **本文変更**: なし

### 2. `src/features/vc/vcMonitor.js`

#### 変更箇所: cleanupOldVcLogs遅延追加（L94付近）
- **種別**: 追加
- **内容**: `bulkDelete`の後に `await new Promise(r => setTimeout(r, 2000))` を追加
- **目的**: VCログ大量削除時の連続API呼び出しによるレートリミット回避
- **本文変更**: なし

## 変更なしのファイル
- `src/features/moti/monthlyDmReminder.js` — 変更なし（ユーザー指示）

## 本文（Embed文面等）への影響
**一切なし** — 全ての変更はログ出力・制御フローのみ
