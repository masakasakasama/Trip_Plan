# Trip_Plan handoff

## 現状
- GitHub Pages向けの静的Webアプリ。
- データ本体は `trip-plan.json`。
- 全デバイス同期はGitHub Contents APIで `trip-plan.json` を読み書きして実現する。
- データモデルは `trips[]`。現在のTripと、完了後に残す過去Tripを同じJSONに保存する。
- 読み込みはtoken不要。自動保存はGitHub Fine-grained personal access tokenが必要。

## Notion要件から反映したこと
- アプリ起動時にGitHubから最新データを取得。
- 入力後に自動保存。
- 数秒ごとにバックグラウンドで最新チェック。
- 手動の「今すぐ同期」ボタンも残している。
- 通信失敗時は最後に成功したキャッシュを表示。
- 前回更新時刻を表示。
- 複数デバイスで同じURLと同じ `trip-plan.json` を共有。
- 完了したTripは `archived: true` にして過去Tripとして残す。
- 片方の端末で保存した内容を他端末にも反映。
- GitHubリポジトリに格納。

## 保存の仕組み
- 共有データ: GitHub `main` ブランチの `trip-plan.json`
- 端末ローカルに残るもの:
  - GitHub token
  - 最後に成功したキャッシュ
- 旅行データそのものは保存時にGitHubへcommitされる。

## 制限
- GitHub Pagesだけでは匿名書き込みができないため、保存する端末にはGitHub tokenが必要。
- 同時編集で衝突した場合は、最新を読み込んでから再保存する。
- Google MapsはAPIキーなしの検索URL連携。Places APIの詳細情報取得は未実装。
- 過去Tripは、このアプリで今後作ったTripを完了後にアーカイブして残す。
- 天気は実測予報ではなく、都市＋出発月の平年値による季節目安（`CLIMATE_BY_CITY`に無い都市は表示なし）。

## タイムゾーン跨ぎの経過時間
- 各予定は `date`(day) + `time` + `timezone`(略称) を持ち、`eventInstant()` でUTC絶対時刻に変換して前の予定との差分を計算する。
- `trip.timezones` の値（例 `"AEST UTC+10"`）を優先解決し、無い略称は `TZ_OFFSETS` テーブルにフォールバック。
- JST補助表示 (`homeTimeLabel`) も同じ絶対時刻から自動換算。手入力 `homeTime` はその値が使えない場合のみのフォールバック。

## 済んだこと（2026-07-05）
- メモ機能を削除（UIが無く死んでいたため）。
- `flights[]` を廃止し、便名・航空会社・機材は該当する旅程アイテムに直接統合。
- 予算をタブ化。`budgetItems[]`（項目名・カテゴリ・予定額・実額）を追加し、ホームの進捗バーも実額から計算。
- タイムゾーン入力をselect化（`trip.timezones`と既存アイテムから選択肢を生成）。
- innerHTML挿入箇所を全てエスケープ（XSS/表示崩れ対策）。
- タブ非表示中はポーリングを止め、復帰時に即同期。

## 次にやること
- スマホ実機でGitHub token保存と同期保存を確認。
- POI編集をpromptではなくモーダルフォームにする。
- 日程アイテムとPOIの紐づけをselectで選べるようにする。
