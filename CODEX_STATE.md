# CODEX_STATE

Status: in_progress
Goal: 旅行計画の同期保護と現行Astra 1.4.0の表示/データ整合性を維持する。

## Done
- 最新main 262cb6a / Astra1.4.0を確認。旧handoffのGitHub token保存/POI prompt/select未実装の記述を歴史資料と明示。
- 実際はWorker secret方式、起動時に旧tokenを除去、POI編集フォーム/日程POI selectは実装済み。
- 同期merge test、Astraデータテスト5件、production buildを検証。buildで生成されたapp.js差分は修正に含めず復元。

- モバイル/desktopの回転・pinch・国/都市選択・Trip選択・16件replay・layout・夜景を全検証。両viewport17replay positions / errors=[]。
- 情報パネルを閉じた後の地図残留、遅延focusによる再表示、Leaflet未初期化flyToを修正。closeは予約focusを取り消し、古いasync/animationを無視する。
- verifyをnpm scriptへ追加。任意Chromiumパス・cwdに依存しないartifact保存・動く都市ラベルの実座標tapに対応。実旅行データ変更なし。

## Current
- 修正後の両viewport全検証結果をvisto-astra/docsに保存。cloud FPSは6/4で、実機性能合格ではない。

## Next
- isolated Worker fixtureでIf-Match競合・pending/recovery再起動復元のE2Eを検証。本番旅行予定へテストを書かない。
- AstraのAbout 1.2.2表記とfooter 1.4.0の既存version差分を同一の情報源へ整える。

## Blockers
- 実Galaxy GPU/fps/発熱は未測定。ブラウザ起動だけで性能合格にしない。
- 本番Workerへの書込み・Cloudflare secret接続は今回未実施。

## Verification
- Astra production build and data tests 5/5; root sync-merge test 1/1 passed
- Playwright full mobile 412x915 / desktop 1440x1000: passed; observed replay steps 17/17; JS/console errors=[] (favicon mocked)
- Chrome immediate focus-cancel fixture: closed=true, stale map initializations=0, JS errors=[]
- node --check focus-detail.js / tools/verify.mjs; git diff --check passed

Updated at: 2026-10-02T17:00:43.568796+00:00
