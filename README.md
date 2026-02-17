# CircleBot

## 起動

```powershell
npm install
npm start
```

Render運用時のエントリは `node bot.js` です。

## Notify API（desktop_app連携）

### 必須環境変数

- `DISCORD_TOKEN`
- `NOTIFY_SECRET`

### 任意環境変数

- `NOTIFY_CHANNEL_ID`
- `SERVER_CONFIG_NAME`（既存運用どおり）

`NOTIFY_CHANNEL_ID` 未設定時は `src/config/servers/<profile>.json` の `notify.channelId` を参照します。

## Members Intent

`GET /api/members` は `guild.members.search()` を利用します。  
Discord Developer Portal の `SERVER MEMBERS INTENT` をONにしてください。  
OFFの場合は検索結果は空配列になります（botは落ちません）。

## API

### 1) メンバー検索

`GET /api/members?query=mi&secret=<NOTIFY_SECRET>`

レスポンス例:

```json
[
  { "userId": "1850...", "displayName": "miri_0382" }
]
```

### 2) 通知投稿

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

指定チャンネルへ embed を投稿し、`mentionUserId` がある場合はメンションします。

