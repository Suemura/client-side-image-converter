# テスト方針の詳細

機能別の単体テスト / E2E の対象一覧。原則は CLAUDE.md の「テスト方針」を参照。


- テストランナーは vitest、DOM 環境は happy-dom（`File` / `FileReader` / `localStorage` などのブラウザ API を使用するため）
- テストファイルはテスト対象と同じディレクトリの `__tests__/` に `<対象ファイル名>.test.ts` として配置する
- `src/utils/` のロジックを追加・変更した場合は、対応する単体テストを追加・更新すること
- EXIF 処理のテストは piexifjs でフィクスチャ（EXIF 入り JPEG）を生成して実データで検証する（`metadataManager.test.ts` 参照）
- Canvas API や WASM / WebGL に依存する処理（描画・変換・エンコード）は happy-dom では動作しないため、単体テストの対象外とする（純粋ロジック部分を切り出してテストする）。編集ページも同様で、色調整の数式（`adjustments.ts` の `applyAdjustmentToPixel` 等）・シェーダ生成/配線（`adjustmentShader.ts`）・LUT のパースと CPU 適用（`lutParser.ts` の `parseCubeLut` / `applyLutToPixel` / `haldClutToLutData` 等）・LUT の選択解決（`lutState.ts` の `resolveLutForIndex` 等）・トーンカーブの点操作・補間・テーブル焼成と CPU 適用（`toneCurve.ts` の `addCurvePoint` / `evaluateCurve` / `buildToneCurveTable` / `applyToneCurveToPixel` 等）・ヒストグラムのビン計算と SVG パス生成（`histogram.ts` の `computeHistogram` / `resolveHistogramSampleSize` / `buildHistogramPath` 等）・自動補正 / WB スポイトのスライダー値逆算とサンプリング（`autoAdjust.ts` の `histogramPercentileRange` / `computeAutoLevels` / `computeWhiteBalanceForNeutralPoint` / `computeAutoWhiteBalance` / `clampSampleWindow` / `averageRgb` / `displayPointToSourcePixel` 等。逆算値を `applyAdjustmentToPixel` へ通すクロスチェック・gray-world との等価性回帰を含む）を純粋ロジックとして単体テスト（`adjustments.test.ts` / `adjustmentShader.test.ts` / `lutParser.test.ts` / `lutState.test.ts` / `toneCurve.test.ts` / `histogram.test.ts` / `autoAdjust.test.ts`）し、WebGL/Canvas を使う実描画（LUT の GPU/CPU 出力ピクセル一致・強度 0 での無効化・プリセット適用・不正ファイル通知、トーンカーブの点追加によるプレビュー・出力の一致（WYSIWYG）とリセット復帰・輝度チャンネルの色味維持・WebGL2 無効化時の CPU 適用、ヒストグラムの輝度スパイク位置・露光量調整への追従・RGB/輝度切替・WebGL2 無効化時の表示、自動補正のオートレベルによるレンジ拡張とスライダー可視化・冪等性・自動ホワイトバランスのチャンネル平均等化・WebGL2 無効化時の適用、WB スポイトのクリック点基準の補正（gray-world なら逆符号になる 2 色画像での証明）・冪等性・分割位置不変・適用後の自動解除・Esc / 再クリック解除とヒント切替・WebGL2 無効化時の適用を含む）は E2E（`e2e/edit.spec.ts`。`.cube` フィクスチャは `e2e/helpers/fixtures.ts` で実行時生成）で検証する
- Canvas 依存の動作は Playwright E2E（`e2e/`）で実ブラウザ検証する。ダウンロード物はマジックナンバーや piexifjs のバイナリ解析で中身まで検証する（`e2e/metadata.spec.ts` 参照）
- E2E のフィクスチャはバイナリを置かず `e2e/helpers/fixtures.ts` で実行時生成する
- E2E は本番同等の静的エクスポート（`npm run build` + `serve out`、ポート 3100）に対して実行される。ローカルで高速に回したい場合は `npm run dev -- --port 3100` を別途起動しておけば `reuseExistingServer` により再利用される（CI では常に build + 静的配信）
- PWA のプリキャッシュ判定・URL 変換・バージョン算出は Canvas 非依存の純粋関数 `precache.ts` に切り出して単体テスト（`precache.test.ts`）。Service Worker 本体の fetch/cache 制御は実ブラウザ動作なので Playwright E2E（`e2e/pwa.spec.ts`）で検証する：manifest link / theme-color / manifest 内容の確認と、SW 登録後に `context.setOffline(true)` で全ルート（/・/convert/・/crop/・/edit/・/metadata/）がキャッシュから描画されること
- PWA の合否は Lighthouse の PWA カテゴリが Lighthouse 12 で廃止されたため、DevTools の Application パネルでの installability 確認と `pwa.spec.ts` のオフライン自動検証で担保する

