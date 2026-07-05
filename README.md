# Trip_Plan

スマホで旅行中に確認しやすいシドニー旅行計画サイトです。

## 同期

GitHub Pagesは静的サイトなので、フロントにGitHub tokenを置く方式は使いません。
全端末同期はCloudflare WorkerがGitHubへの読み書きを代行します。

同期データ:

- `trip-plan.json`: 全端末同期の正本データ

## Cloudflare Worker setup

1. Cloudflareにログイン

```powershell
npx wrangler login
```

2. GitHub fine-grained PATをWorker secretに設定

必要権限: `masakasakasama/Trip_Plan` の `Contents: Read and write`

```powershell
npx wrangler secret put GITHUB_TOKEN
```

3. Workerをデプロイ

```powershell
npx wrangler deploy
```

4. 表示されたWorker URLを `sync-config.js` に設定

```js
window.TRIP_SYNC_WORKER_URL = "https://trip-plan-sync.<your-subdomain>.workers.dev";
```

これで同じリンクを開くPC・スマホ・別ブラウザが自動で同じ `trip-plan.json` を読み書きします。

## GitHub Pages

`.github/workflows/pages.yml` でGitHub ActionsからPagesへデプロイします。

GitHub Settings > Pages の Source は `GitHub Actions` を選択してください。

## ファイル

- `index.html`: 画面構造
- `styles.css`: 見た目
- `app.js`: 旅程表示、編集、自動同期
- `sync-config.js`: Worker URL設定
- `worker.js`: Cloudflare Worker
- `wrangler.toml`: Workerデプロイ設定
- `sydney-trip-data.js`: 初期データ
- `trip-plan.json`: Workerが読み書きする同期データ
