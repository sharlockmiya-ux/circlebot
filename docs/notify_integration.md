# notify integration

## 概要

desktopアプリは以下の2APIを使用します。

- `GET /api/members?query=<text>&secret=<NOTIFY_SECRET>`
- `POST /api/notify`（bodyに `secret` を含める）

既存互換として `/notify` / `/notify/members` も同じハンドラで処理します。

## 環境変数 / 設定

- `NOTIFY_SECRET`（必須）
- `NOTIFY_CHANNEL_ID`（任意）
  - 未指定時は `src/config/servers/<profile>.json` の `notify.channelId`
  - さらに未設定時は既定チャンネル `1432388076256231516`

server config 例:

```json
"notify": {
  "channelId": "1432388076256231516"
}
```

## API仕様

### 1) メンバー検索

`GET /api/members?query=mi&secret=<secret>`

レスポンス（最大25件）:

```json
[
  { "userId": "1850...", "displayName": "miri_0382" }
]
```

- `query` は2文字以上
- Members Intentが無効/権限不足時は空配列を返す
- エラー時もbotプロセスは継続

### 2) チャンネル通知

`POST /api/notify`

```json
{
  "secret": "<NOTIFY_SECRET>",
  "mentionUserId": "1850...",
  "event": "maxShotsReached",
  "shots": 50,
  "maxShots": 50,
  "templatePack": "default",
  "savedTo": "C:\\Users\\...\\output"
}
```

送信内容:
- `content`: `<@mentionUserId>`（指定時のみ）
- embed title: `作業完了`
- embed description: `botが作業を終了しました（maxShots到達）` など

`mentionUserId` が指定された場合は、対象Guildメンバーかを検証します。  
非メンバーは `403`。

## Server Members Intent の注意

`/api/members` は `guild.members.search()` を使用します。  
Discord Developer Portal で **SERVER MEMBERS INTENT** がOFFだと検索候補は空になります。

設定手順:
1. Developer Portal -> 対象アプリ -> `Bot`
2. `Privileged Gateway Intents`
3. `SERVER MEMBERS INTENT` をON
4. Bot再起動

## 疎通確認（PowerShell）

```powershell
$base = "https://circlebot-1.onrender.com"
$secret = "<NOTIFY_SECRET>"

Invoke-RestMethod `
  -Method GET `
  -Uri "$base/api/members?query=mi&secret=$secret" `
  -Headers @{ "X-Notify-Secret" = $secret }

Invoke-RestMethod `
  -Method POST `
  -Uri "$base/api/notify" `
  -ContentType "application/json" `
  -Headers @{ "X-Notify-Secret" = $secret } `
  -Body (@{
    secret = $secret
    event = "maxShotsReached"
    shots = 1
    maxShots = 1
    templatePack = "default"
    savedTo = "C:\\tmp\\output"
  } | ConvertTo-Json)
```
