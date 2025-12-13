# CircleBot v15 リファクタ：整理（削除候補）チェックリスト

> 注意：ここに挙げるものは **「存在していて、かつ現状参照されていない」場合のみ**整理対象です。  
> 先に必ず起動・主要機能（roles / vc / moti）を確認してから実施してください。

---

## A. 旧ルート直下の“単発スクリプト”類（使っていなければ）
- `sendEmbed.js`
- `sendIdolRolePanel.js`
- `sendAnnouncementRole.js`

## B. 旧ディレクトリ（src移行済なら）
- `data/`（旧SheetStore等）
- `features/`（旧rolepanel等）
- `src/index.js`（旧入口ファイルが残っている場合）

## C. 空/未使用の可能性が高いもの
- `src/utils/`（空なら削除候補）
- `src/constants/texts.js`（空のままなら削除候補）

---

## 推奨手順（安全）
1. まず `scripts/scanCleanupCandidates.js` を実行して“候補”を一覧表示
2. 表示された候補について、`require(` / `import` / 実行コマンドから参照されていないか確認
3. 問題なければ `--apply` で削除（自己責任で）

