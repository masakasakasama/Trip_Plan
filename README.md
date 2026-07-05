# Trip_Plan

ふたりで旅行のラフプラン、行きたい場所、日程を作るGitHub Pagesアプリ。
現在のTripと、完了後に残す過去Tripを同じJSONで管理します。

## 同期

- データ本体は `trip-plan.json`
- ページ起動時にGitHubから最新データを取得
- 数秒ごとに最新チェック
- 入力後に自動で `trip-plan.json` を更新
- `今すぐ同期` で待たずに保存
- 通信失敗時は最後に成功したキャッシュを表示

自動保存にはGitHub Fine-grained personal access tokenが必要です。

推奨token設定:

- Repository access: `masakasakasama/Trip_Plan` のみ
- Permissions: `Contents` を `Read and write`

## GitHub Pages

このリポジトリは `.github/workflows/pages.yml` でGitHub ActionsからPagesへデプロイします。

GitHub Settings > Pages の Source は `GitHub Actions` を選択してください。

## ファイル

- `index.html`: UI
- `styles.css`: 見た目
- `app.js`: GitHub同期と編集ロジック
- `trip-plan.json`: 共有される旅行データ。`trips[]` に現在/過去Tripを保存
- `handoff.md`: 作業メモ

## 機能メモ

- 旅程の各予定は現地時刻＋タイムゾーン略称（JST/PHT/AEST等）を持ち、予定同士の実経過時間をタイムゾーン跨ぎも含めて自動計算・表示します。JST補助時刻も自動換算です。
- 航空便情報（便名・航空会社・機材）は旅程の予定に直接ひも付けて表示します（別セクションなし）。
- 予算はホームの進捗バーと「予算」タブの両方で、`budgetItems[]`の実額から計算します（固定値ではありません）。
- 天気はリアルタイム予報ではなく、出発地の主要都市＋出発月の平年値による季節の目安です。
