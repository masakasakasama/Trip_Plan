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

### 同期時のデータ保護

- Workerは`If-Match`で読み込み時のSHAを検証し、古いデータによる上書きを拒否します。
- 競合時は予定・やること・スポット・予算をID単位で3方向マージして再保存します。
- 未送信の変更は保存完了まで端末の`trip-plan-pending-v1`へ退避し、再起動後に復元します。
- 同じ項目の同じ欄が同時変更された場合は、端末の`trip-plan-recovery-v1`へ直近3件の競合スナップショットを残します。
- GitHubのコミット履歴には各保存前後の共有データが残ります。
- GitHub Actionsが毎時データを確認し、変更時は`trip-plan-backups`ブランチにもJSONスナップショットを保存します。

## 天気

Sydneyの当日予報はOpen-Meteoから取得します。Sydney現地日付の変更、画面復帰、オンライン復帰で更新し、取得できない場合だけ季節の平年目安へフォールバックします。予算画面では天気カードを表示しません。

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
