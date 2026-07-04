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
