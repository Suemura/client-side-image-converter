# CLAUDE.md

このファイルは、このリポジトリでコードを扱う際の Claude Code (claude.ai/code) へのガイダンスを提供します。

## プロジェクト概要

Next.js App Router で構築されたプライバシー重視のクライアントサイド画像変換ウェブアプリケーション。すべての画像処理はブラウザ内で実行され、画像がサーバーに送信されることはありません。

## 開発コマンド

```bash
# 依存関係のインストール（npm を使用。lockfile は package-lock.json）
npm install

# Turbopack による開発サーバーの起動
npm run dev

# リンティングの実行
npm run lint

# リント違反の自動修正 + フォーマット
npm run lint:fix

# 型チェックの実行
npm run typecheck

# 単体テストの実行
npm run test

# 単体テストのウォッチモード
npm run test:watch

# E2E テストの実行（Playwright / build + out/ の静的配信をポート 3100 で自動起動）
npm run e2e

# E2E テストの UI モード
npm run e2e:ui

# 本番用ビルド（静的エクスポート。webpack ビルド、下記注記参照）
# postbuild で sitemap（next-sitemap）と Service Worker（scripts/generate-sw.ts → out/sw.js）を続けて生成する
npm run build

# Cloudflare Pages へのデプロイ
npm run deploy

# デプロイ版のローカルプレビュー
npm run preview
```

※ Next.js 16 はデフォルトで Turbopack を本番ビルドに使うが、本プロジェクトでは「Creating an optimized production build ...」で無限ハングする上流の既知問題（vercel/next.js discussion #77102 と同症状）があるため、`build` スクリプトは `next build --webpack` にオプトアウトしている。dev サーバー（`next dev --turbopack`）は正常動作するため Turbopack のまま。**上流修正後に Turbopack ビルドへ戻す暫定対応**。

## 完了条件（Definition of Done）

コード変更を伴うタスクは、以下がすべて成功した状態で完了とすること：

1. `npm run lint` — Biome によるリント・フォーマットチェック
2. `npm run typecheck` — TypeScript 型チェック
3. `npm run test` — vitest による単体テスト

これらが失敗したまま作業を終了しないこと。なお、応答終了時（Stop フック）に TS/TSX ファイルの変更があると上記 3 つが自動実行され、失敗した場合はエラー内容が差し戻される。

## アーキテクチャ

### 技術スタック
- **フレームワーク**: Next.js 16 with App Router
- **言語**: TypeScript（strict モード）
- **スタイリング**: CSS Modules
- **i18n**: react-i18next（日本語/英語サポート）
- **リンター/フォーマッター**: Biome（ESLint/Prettier の代替）
- **テスト**: vitest + happy-dom
- **デプロイ**: Cloudflare Pages（静的エクスポート）

### 主要ディレクトリ構造
- `src/app/` - Next.js App Router ページ
  - `convert/` - 画像フォーマット変換ページ
  - `crop/` - 画像トリミングツールページ（`components/CropSelector.tsx`（8方向ハンドル操作・比率固定リサイズ）と `components/CropToolbar.tsx`（アスペクト比・回転/反転・適用範囲）で構成）
  - `metadata/` - EXIF メタデータエディターページ
  - `manifest.ts` - PWA の Web App Manifest。Next が `/manifest.webmanifest` として静的出力し `<link rel="manifest">` を自動注入する（`dynamic = "force-static"`）
- `src/components/` - 再利用可能な React コンポーネント（PWA 関連: `ServiceWorkerRegister.tsx`（本番ビルドでのみ `/sw.js` を登録・UI なし）/ `InstallPrompt.tsx`（`beforeinstallprompt` を受けた控えめな A2HS 導線））
- `src/utils/` - コアユーティリティクラス
  - `imageConverter.ts` - 画像フォーマット変換処理（単体変換 `convertImage` と一括変換 `convertMultipleImages`。一括は対応環境で Worker プールへ委譲し、非対応環境ではメインスレッド逐次処理。`mode: "optimize"` のときは形式維持の最適化として `optimizeImage` に分岐し、`optimizeImage` を再エクスポートする）
  - `conversionCore.ts` - 変換のコア型（`ConversionFormat` / `ConversionMode`（"convert" / "optimize"） / `ConversionOptions`（`mode` を含む） / `ConversionResult` 等）と Canvas 非依存の純粋ロジック（`searchQualityForTargetSize` / `calculateTargetSize`）。メインスレッドと Worker で共有（`imageConverter.ts` から再エクスポートし既存 import 経路を維持）
  - `conversionResult.ts` - `ConversionResult` 組み立ての共通化（変換用 `buildConversionResult` / 最適化用 `buildOptimizeResult`（同一形式のため元ファイル名を維持））。convertImage とワーカープールで共用
  - `concurrency.ts` - 純粋な並行スケジューラ（`mapWithConcurrency` / `resolveConcurrency`）。同時実行数制限・入力順保持・continue-on-error・逐次進捗
  - `pngQuality.ts` - PNG 品質ティア判定（`pngQualityStrategy`。閾値 95/70）。メインスレッドと Worker で共有
  - `decodedImage.ts` - HEIC/TIFF デコード結果（RGBA 生ピクセル）の共有型 `DecodedImage`
  - `avifEncoder.ts` - AVIF エンコード処理（`@jsquash/avif` の WASM を動的 import。`HTMLCanvasElement | OffscreenCanvas` 両対応）
  - `optimizeCore.ts` - 画像最適化（形式維持の再圧縮）のコア型と Canvas / WASM / DOM 非依存の純粋ロジック（型 `OptimizeEngine` / `WebpEncoding`、形式→エンジンをディスパッチする `resolveOptimizeEngine` / `isOptimizableType`、no-worse-than-original 判定の `pickSmallerSize`、RIFF/VP8L/VP8/VP8X 走査で WebP のロスレス/ロッシーを判定する `detectWebpEncoding`）。メインスレッドと Worker で共有し単体テスト対象（`conversionCore.ts` と同方針）
  - `imageOptimizer.ts` - 形式維持の最適化のブラウザ側オーケストレーション（`@jsquash/oxipng` / `@jsquash/jpeg` / `@jsquash/webp` を動的 import。Canvas 非依存でメイン/Worker 共用の `optimizeImageBuffer`、メインスレッド用ラッパー `optimizeImage`）
  - `heicDecoder.ts` - HEIC/HEIF デコード処理（libheif WASM、動的 import。Canvas 非依存の `decodeHeicToImageData` を含む）
  - `tiffDecoder.ts` - TIFF デコード処理（`utif2` の純 JS デコーダー、動的 import。Canvas 非依存の `decodeTiffToImageData` を含む）
  - `imageCropper.ts` - 画像トリミング処理（EXIF Orientation 補正 + 回転/反転をキャンバスに焼き込む `renderOrientedImage` / `createOrientedPreviewUrl`、`cropImage`（`transform` / `quality` 引数対応）、画像ごとの領域・変換を受け取る `cropImages`（`CropJob[]`）。`CropArea` / `CropTransform` は `cropGeometry.ts` から再エクスポート）
  - `cropGeometry.ts` - トリミングの座標計算に関する Canvas 非依存の純粋ロジック（型 `CropArea` / `CropTransform` / `CropState`、`ASPECT_RATIO_PRESETS`、`clampCropArea` / `scaleCropArea` / `toDisplayArea` / `fitAspectRatio` / `enforceAspectRatio` / `orientedSize` / `rotateRight` / `rotateLeft` / `resolveCropForIndex`）。CropSelector（表示座標）・crop ページ（自然座標保持）・imageCropper（出力）で共有し単体テスト対象
  - `metadataManager.ts` - EXIF データ管理（JPEG / PNG / WebP からの読み取り、GPS の十進変換・丸めの純粋関数を含む）
  - `exifBinary.ts` - Canvas / WASM / ブラウザ API 非依存の純粋なバイナリ操作群（PNG eXIf チャンク・WebP RIFF/VP8X チャンクの抽出/挿入、CRC32、`Exif\0\0` 識別子の付け外し、piexif dump ↔ 純 TIFF 変換、合成 JPEG 生成）
  - `exifTransfer.ts` - ソース EXIF の読み取りから出力 Blob への書き込みまでを橋渡しするブラウザ側ロジック（`exifWritableFormat` / `readExifTiffFromDataUrl` / `insertExifIntoBlob`、および焼き込み済み出力に合わせて純 TIFF の Orientation を 1 に正規化しつつ実ピクセル寸法タグ（PixelXDimension/PixelYDimension）を出力寸法へ揃える `normalizeExifForBakedImage`）。変換・トリミングの両経路で共用
  - `pageMetadata.ts` - ページ別 SEO メタデータ（title / description / OGP / Twitter / canonical）を組み立てる純粋関数 `buildPageMetadata` とサイト定数（`SITE_NAME` / `SITE_URL` / `SITE_LOCALE`）
  - `directoryReader.ts` - フォルダドロップ時に FileSystem Entry API を再帰走査して配下の File を収集する純粋ロジック（`getEntriesFromDataTransferItems` / `collectFilesFromEntries`）。`collectFilesFromEntries` は任意の `maxFiles` 引数で収集件数を早期打ち切りでき（残余バジェットを再帰にも伝播）、巨大ツリー誤投入時のメモリ圧迫を防ぐ（未指定時は無制限）
  - `precache.ts` - Service Worker のプリキャッシュ判定・URL 変換（trailingSlash に合わせ index.html をディレクトリ URL 化）・キャッシュバージョン算出（FNV-1a）・キャッシュ名生成の純粋関数（`shouldPrecache` / `toCacheUrl` / `buildPrecacheUrls` / `computeCacheVersion` / `getCacheName`）。Canvas / DOM / Node API 非依存で単体テスト対象。ビルド時の SW ジェネレーター（`scripts/generate-sw.ts`）と共用
  - `__tests__/` - 単体テスト
- `src/hooks/` - カスタム React フック
  - `usePasteImages.ts` - ページ全体の paste イベントを購読し、クリップボードの画像ファイルをコールバックに渡すフック
- `src/workers/` - Web Worker（変換ページのバッチ処理を並列化）
  - `imageProcessing.worker.ts` - 画像処理 Worker。デコード（createImageBitmap / HEIC / TIFF）→ OffscreenCanvas 描画・リサイズ → エンコード（convertToBlob / `@jsquash/avif`）→ EXIF 挿入 を Worker 内で完結。`mode: "optimize"` のときは冒頭で分岐し、OffscreenCanvas を経由せず `optimizeImageBuffer` で形式維持の再圧縮を行う。`new Worker(new URL(..., import.meta.url), { type: "module" })` で生成し、`next build --webpack` + `output: "export"` でワーカーチャンクが `out/_next/static/` に出力される
  - `imageProcessingPool.ts` - メインスレッド側プール。convert は `isOffscreenPipelineSupported()`、optimize は `Worker` の有無で対応判定し `navigator.hardwareConcurrency` を上限に Worker を起動。Worker 失敗・クラッシュ時は当該ファイルのみメインスレッド（convert は `convertImage` / optimize は `optimizeImage`）にフォールバック。成功時は mode に応じて `buildConversionResult` / `buildOptimizeResult` で結果を組み立て、バッチ完了時に terminate
  - `messages.ts` - Worker とメインスレッド間のメッセージ型
- `src/i18n/` - 国際化設定
- `src/types/` - 外部ライブラリの型定義（piexifjs / exif-js / heic-decode）
- `scripts/` - ビルド補助スクリプト（`tsconfig.json` の `exclude` に含め tsc 対象外）
  - `generate-sw.ts` - postbuild で `out/` を再帰走査し、`precache.ts` の純粋関数でプリキャッシュ URL とバージョンを算出、テンプレートに注入して Service Worker（`out/sw.js`）を生成する。Node 24 の TypeScript 型ストリップ実行（`node scripts/generate-sw.ts`）で動くため tsx 等の追加依存は不要
  - `sw-template.js` - Service Worker 本体テンプレート。`__CACHE_NAME__` / `__PRECACHE_URLS__` を generate-sw.ts が実値へ差し替える
  - `generate-icons.mjs` - PWA アイコン PNG を生成する一度きりのスクリプト（`icon.svg` と Logo.tsx のブランドマークから Playwright の Chromium でラスタライズ。ビルドには組み込まず、生成物をコミットして配信する）
- `public/` - 静的アセット（ビルド時に `out/` へコピーされ配信される）
  - `icons/` - PWA アイコン（`icon.svg` と生成済みの `icon-192.png` / `icon-512.png` / `icon-maskable-512.png`）
  - `_headers` - Cloudflare Pages 用ヘッダー設定（`/sw.js` は `no-cache`、`/_next/static/*` は長期 `immutable`、`/manifest.webmanifest` の content-type を明示）

### パスエイリアス
プロジェクトでは `tsconfig.json` で設定された TypeScript パスエイリアスを使用：
- `@/*` → `src/*`
- `@components/*` → `src/components/*`
- `@utils/*` → `src/utils/*`

※ vitest 用のエイリアスは `vitest.config.ts` にも定義されている。エイリアスを追加する場合は両方を更新すること。

### コア機能
1. **画像フォーマット変換 / 最適化** - JPEG、PNG、WebP、AVIF 形式への変換（品質制御付き。AVIF は出力のみ対応）。目標ファイルサイズ (KB) を指定すると品質を二分探索して目標以下で最大品質の結果を出力する（JPEG / WebP のみ。達成不可時は最小サイズで出力し一覧に警告表示）。処理モードのラジオで「フォーマット変換」と「最適化（形式を維持）」を切り替えられ、最適化はフォーマットを変換せず入力と同じ形式のまま再圧縮してサイズを削減する（PNG は可逆・ピクセル不変、JPEG / WebP は高品質で再エンコード。削減できなければ元をそのまま採用。対応は PNG / JPEG / WebP のみで対応外は失敗通知。最適化モード時は変換用の設定（対象フォーマット・品質・目標サイズ・画像サイズ・EXIF 保持）を非表示にする）。HEIC/HEIF（iPhone 写真）と TIFF は変換ページのみ入力として受理（crop / metadata はブラウザがプレビュー描画できないため対象外）。変換・最適化に失敗したファイルは一覧で画面に通知される
2. **画像トリミング** - プレビュー付きのビジュアルトリミングインターフェース。アスペクト比プリセット（自由 / 1:1 / 16:9 / 4:3 / 3:2。自由以外は選択中のドラッグ・8方向リサイズ・移動が比率固定）、右/左 90° 回転・左右/上下反転、適用範囲の切り替え（「全画像一括」／「画像ごと」。画像ごとは ←/→ ナビゲーションと連動して画像単位に領域・回転/反転を保持・適用）に対応。プレビュー時に EXIF Orientation を `createImageBitmap(imageOrientation: "from-image")` で自動補正し回転/反転をキャンバスへ焼き込む（EXIF 保持時は出力の Orientation タグを 1 に正規化して二重回転を防ぐ）
3. **EXIF メタデータ管理** - EXIF データの表示（JPEG / PNG / WebP に対応）、編集、選択的削除。GPS 位置は「削除」に加えて「市区町村レベルに丸める」（約 1km 精度で残す）を選択可能（GPS タグがある場合のみ UI 表示。丸めは JPEG のみ有効で、その他の形式は Canvas 再描画により全メタデータを削除）。変換・トリミングの「EXIF を保持」は JPEG / PNG / WebP 出力で有効（AVIF は非対応）
4. **バッチ処理** - 複数画像の一括処理（ドラッグ&ドロップ / ファイル選択 / クリップボード貼り付け / フォルダドロップで投入）。一度に取り込める件数はハード上限 `MAX_INPUT_FILES`（200 件）までで、フォルダの再帰取込や複数選択で上限を超えた分は取り込まず非ブロッキングの警告を表示する（大量投入時のフリーズ/メモリ圧迫を防ぐため）。変換ページは対応環境で Web Worker + OffscreenCanvas のプール（`navigator.hardwareConcurrency` を上限に並列）で処理し UI をブロックしない（非対応環境はメインスレッド逐次処理にフォールバック）
5. **プライバシーファースト** - Canvas API / WASM を使用したクライアントサイドでの全処理
6. **PWA（オフライン対応・インストール可能）** - Web App Manifest とビルド時生成の Service Worker により、一度アクセスすれば JS/CSS/フォント/WASM/HTML/アイコンがプリキャッシュされ、オフラインでも全機能が動作する。対応ブラウザ（主に Chromium 系）ではホーム画面/デスクトップへインストール可能（`beforeinstallprompt` を受けた控えめな導線を表示）

### 重要なパターン
- 画像処理はクライアントサイド操作のために Canvas API を使用
- 変換ページのバッチ処理は Web Worker + OffscreenCanvas のワーカープール（`src/workers/`）で並列実行する。`navigator.hardwareConcurrency` を上限に Worker を起動し、デコード〜エンコード〜EXIF 挿入まで Worker 内で完結させメインスレッド（UI）をブロックしない。AVIF の WASM エンコード（従来メインスレッドで同期実行し UI をフリーズさせていた）も Worker 内で実行する。OffscreenCanvas / Worker / createImageBitmap 非対応環境（`isOffscreenPipelineSupported()` で判定）ではメインスレッド逐次処理にフォールバックし、Worker が個別に失敗・クラッシュした場合も当該ファイルのみ `convertImage` で再試行する。メインスレッドと Worker が共有する型・純粋ロジックは Canvas 非依存の `conversionCore.ts` / `concurrency.ts` / `pngQuality.ts` に集約し、Worker バンドルへの Canvas コード混入を防ぐ
- AVIF エンコードのみ Canvas の `toBlob("image/avif")` が全ブラウザ未実装のため、`@jsquash/avif`（WASM）を動的 import で使用（AVIF 変換実行時のみロードされ、初期バンドルに影響しない。処理はブラウザ内で完結）
- 最適化（形式を維持）モードはフォーマットを変換せず、入力と同じ形式のまま再圧縮してサイズを削減する（Issue #61）。エンジンは形式ごとに動的 import で使い分ける: PNG は `@jsquash/oxipng`（バイト列→バイト列の真の可逆最適化・ピクセル不変・Canvas 不要）、JPEG は `@jsquash/jpeg`（mozjpeg。progressive + trellis 量子化での高品質再エンコードで実質劣化最小）、WebP は `@jsquash/webp`（ロスレス VP8L 入力はロスレス再エンコード、ロッシー入力は高品質ロッシー再エンコード）。いずれも最適化後が元以上なら元をそのまま採用する（no-worse-than-original）。対応形式は PNG / JPEG / WebP のみで、対応外（BMP / TIFF / HEIC / AVIF 等）は失敗として一覧通知される。jsquash はバッファを直接処理し OffscreenCanvas が不要なため、バッチは `Worker` があれば（OffscreenCanvas 非対応環境でも）ワーカープールで各形式のまま並列最適化し（混在バッチ可）、Worker 不在・個別失敗時はメインスレッドの `optimizeImage` にフォールバックする。形式→エンジンのディスパッチ・no-worse-than-original 判定・WebP のロスレス/ロッシー判定は Canvas 非依存の純粋関数 `optimizeCore.ts`（単体テスト対象）に集約し、jsquash を動的 import するブラウザ側オーケストレーションは `imageOptimizer.ts`（メイン/Worker 共用の `optimizeImageBuffer`・メインスレッド用 `optimizeImage`）が担う。UI の処理モード切替は `src/app/convert/components/ConversionSettings.tsx`（文言は i18n `convert.mode` / `convert.modeConvert` / `convert.modeOptimize` / `convert.optimizeDescription` など）
- HEIC/HEIF のデコードは libheif の WASM ビルド（`heic-decode` + `libheif-js`）を使用し、動的 import により HEIC 変換時のみロードする（初期バンドルに影響なし）
- TIFF のデコードは `utif2`（純 JS の TIFF デコーダー）を使用し、動的 import により TIFF 変換時のみロードする（初期バンドルに影響なし。マルチページ TIFF は先頭ページのみ対応）
- HEIC / TIFF は MIME タイプが特定されない環境があるため、拡張子（.heic/.heif/.tif/.tiff）によるフォールバック判定を行う（`fileUtils.ts` の `FORMAT_EXTENSION_FALLBACKS`。`isHeicFile` / `isTiffFile` の判定と input の accept 属性の両方で使用）
- 画像の投入は全ページ共通の `FileUploadArea` に集約し、ドラッグ&ドロップ / ファイル選択 / クリップボード貼り付け（Ctrl/Cmd+V、`usePasteImages` フック）/ フォルダドロップ（`directoryReader.ts` による再帰走査）のいずれも共通関数 `addFiles`（`filterValidFiles` による MIME フィルタ → `addUniqueFilesWithLimit` による重複除外 + 上限件数 `MAX_INPUT_FILES`（200 件）での切り詰め）に合流させる。上限超過時は超過分を取り込まず、`role="alert"` の非ブロッキング警告ボックス（i18n `fileUpload.limitExceeded`）を表示する（リストクリアでリセット）。フォルダドロップは drop イベント中に `webkitGetAsEntry()` を同期取得してから再帰走査する（非対応環境は `dataTransfer.files` にフォールバック）。走査は `collectFilesFromEntries(entries, MAX_INPUT_FILES + 1)` で有界化し、巨大ツリーでも File 参照が無制限に積み上がらないようにする。クリップボード取り込みは `fileUtils.ts` の `getFilesFromClipboardData`（`.files` 優先、無ければ `.items` の `kind === "file"`）
- トリミングの座標計算（境界クランプ・表示⇔自然座標変換・アスペクト比の当てはめ/強制・回転後寸法・画像ごとの領域/変換の解決）は Canvas / DOM 非依存の純粋関数 `cropGeometry.ts` に集約し、CropSelector（表示座標での操作。`aspectRatio` prop で比率固定リサイズ）・crop ページ（自然座標での state 保持と適用範囲トグル）・`imageCropper.ts`（出力）で共有して単体テストする。回転/反転と EXIF Orientation は `renderOrientedImage` でプレビューと出力の双方に同一ロジックで焼き込み（WYSIWYG）、EXIF 保持時のみ `normalizeExifForBakedImage` で出力 TIFF の Orientation を 1 に揃え、実ピクセル寸法タグ（PixelXDimension/PixelYDimension）が存在すれば出力寸法へ更新する。トリミングツールバー UI は `src/app/crop/components/CropToolbar.tsx`（文言は i18n `crop.*`）
- EXIF データ処理は保存に `piexifjs`、読み取りに `exif-js` を使用。WebP（RIFF の EXIF チャンク）と PNG（eXIf チャンク）は、取り出した TIFF を合成 JPEG（APP1）に包んで exif-js に読ませる（exif-js は先頭が JPEG SOI でないと読めないため）
- EXIF の書き込みは JPEG（piexifjs）に加え、PNG は eXIf チャンク、WebP は VP8X + EXIF チャンクへ挿入する。バイナリ操作は Canvas / ブラウザ API 非依存の純粋関数 `exifBinary.ts`（単体テスト対象）に切り出し、ブラウザ側の読み取り〜書き込みの橋渡しを `exifTransfer.ts` が担う。AVIF はメタデータ書き込み非対応
- テーマ切り替え（ライト/ダーク）は CSS カスタムプロパティで処理
- 言語設定は localStorage に保存
- ファイルダウンロードはバッチ操作に `JSZip` を使用
- ページ別の SEO メタデータ（title / description / OGP / Twitter card / canonical）は `pageMetadata.ts` の `buildPageMetadata` で組み立て、各ルートの `layout.tsx`（`"use client"` を持たないサーバーコンポーネント）から export する（ページ本体が client component で metadata を直接 export できないための構成）。root の `layout.tsx` が `metadataBase`・title テンプレート（`%s | Client-Side Image Converter`）・共通 description・OGP / Twitter 既定値を集約し、トップページ `/` はこの既定値を使う。メタデータは i18next 非経由の静的 HTML なので主言語は日本語（`lang="ja"` / i18n 既定 `lng: "ja"` に合わせる。ロケール JSON の変更は不要）。専用 OG 画像アセットが無いため Twitter card は `summary`（画像追加時に `summary_large_image` へ切り替える想定）
- PWA は静的エクスポート（`output: "export"` + `next build --webpack`）+ Cloudflare Pages の構成に合わせ、ビルドツール非依存の「手書き SW テンプレート + postbuild ジェネレーター」方式で実現している。`scripts/sw-template.js` を `scripts/generate-sw.ts` がビルド後に処理し `out/sw.js` を出力する（`npm run build` の `postbuild` チェーン: `next-sitemap && node scripts/generate-sw.ts`）。プリキャッシュ判定・URL 変換・バージョン算出は純粋関数 `precache.ts` に切り出して単体テストする
- キャッシュ更新戦略: プリキャッシュ対象は `out/` 全ファイル − denylist（`sw.js` / `_headers` / `robots.txt` / `sitemap*.xml` / `*.map`）。プリキャッシュ URL 一覧のハッシュ（FNV-1a）をキャッシュ名（`wic-precache-<version>`）に含めるため、内容ハッシュ付きの `_next/static/**` が変わったときだけバージョンが変わる。SW は install で `addAll` によるプリキャッシュ、activate で現行バージョン以外の旧キャッシュ削除 + `clients.claim`（`skipWaiting` は付けず更新は次回起動時に反映しセッション中の突然の差し替えを防ぐ）、fetch はハッシュ付きアセット cache-first + ナビゲーションは cache → network → キャッシュ済み `/` フォールバック
- Service Worker の登録は `ServiceWorkerRegister` が `process.env.NODE_ENV === "production"` のときだけ行う（dev で古いキャッシュが配信される事故を防ぐ）。theme-color は root `layout.tsx` の `viewport` export でライト（#f9fafb）/ダーク（#0e1117）を出し分ける。`_headers` で `/sw.js` を `no-cache` にしデプロイごとに新しい SW を確実に取得させる（public/ 配下は `out/` にコピーされて配信される）

## テスト方針

- テストランナーは vitest、DOM 環境は happy-dom（`File` / `FileReader` / `localStorage` などのブラウザ API を使用するため）
- テストファイルはテスト対象と同じディレクトリの `__tests__/` に `<対象ファイル名>.test.ts` として配置する
- `src/utils/` のロジックを追加・変更した場合は、対応する単体テストを追加・更新すること
- EXIF 処理のテストは piexifjs でフィクスチャ（EXIF 入り JPEG）を生成して実データで検証する（`metadataManager.test.ts` 参照）
- Canvas API や WASM に依存する処理（描画・変換・エンコード）は happy-dom では動作しないため、単体テストの対象外とする（純粋ロジック部分を切り出してテストする）
- Canvas 依存の動作は Playwright E2E（`e2e/`）で実ブラウザ検証する。ダウンロード物はマジックナンバーや piexifjs のバイナリ解析で中身まで検証する（`e2e/metadata.spec.ts` 参照）
- E2E のフィクスチャはバイナリを置かず `e2e/helpers/fixtures.ts` で実行時生成する
- E2E は本番同等の静的エクスポート（`npm run build` + `serve out`、ポート 3100）に対して実行される。ローカルで高速に回したい場合は `npm run dev -- --port 3100` を別途起動しておけば `reuseExistingServer` により再利用される（CI では常に build + 静的配信）
- PWA のプリキャッシュ判定・URL 変換・バージョン算出は Canvas 非依存の純粋関数 `precache.ts` に切り出して単体テスト（`precache.test.ts`）。Service Worker 本体の fetch/cache 制御は実ブラウザ動作なので Playwright E2E（`e2e/pwa.spec.ts`）で検証する：manifest link / theme-color / manifest 内容の確認と、SW 登録後に `context.setOffline(true)` で全ルート（/・/convert/・/crop/・/metadata/）がキャッシュから描画されること
- PWA の合否は Lighthouse の PWA カテゴリが Lighthouse 12 で廃止されたため、DevTools の Application パネルでの installability 確認と `pwa.spec.ts` のオフライン自動検証で担保する

## Claude Code ハーネス

全体像・設計意図・運用上の注意は `docs/HARNESS.md` を参照。

### CI / デプロイ（`.github/workflows/`）

- **ci.yml**: すべての PR と main への push で 2 ジョブを自動実行
  - `check`: `npm ci` → lint → typecheck → test → build
  - `e2e`: Playwright E2E（Chromium）。失敗時は playwright-report をアーティファクト保存
- **deploy.yml**: main への push で Cloudflare Pages へ本番デプロイ、PR ではプレビューデプロイ + URL を PR にコメント
- **Dependabot（`.github/dependabot.yml`）**: npm と GitHub Actions の依存を毎週月曜 09:00（JST）にチェックし更新 PR を作成（minor / patch は 1 PR にグループ化、open PR 上限 5）
- **main はブランチ保護済み**: `check` と `e2e` の両方が緑でないとマージ不可（管理者含む）
- CI の Node は 24 に固定（npm 10 系では lockfile 検証の挙動差で `npm ci` が失敗するため変更しない）
- `package-lock.json` が壊れた場合（CI の `npm ci` だけが失敗する場合）は `rm -rf node_modules package-lock.json && npm install` でゼロから再生成する
- Cloudflare 認証情報は GitHub Actions シークレットとローカルの `.env`（gitignore 済み）にのみ置く。**リポジトリにコミットしないこと**

### フック・権限（`.claude/settings.json`）

- **PostToolUse (Write|Edit)**: ファイル編集後に Biome で自動フォーマット。編集直後にファイルが書き換わることがあるため、編集が失敗する場合はファイルを読み直すこと
- **PostToolUse (Bash: gh pr create)**: PR 作成を検知し、自動レビューフロー（下記）の開始を指示（スクリプト: `.claude/hooks/pr-created.sh`）
- **Stop**: 応答終了時、TS/TSX ファイルに未コミットの変更があれば lint + typecheck + test を自動実行（スクリプト: `.claude/hooks/check-on-stop.sh`）。失敗するとエラー内容が差し戻されるので修正して再度終了すること
- **permissions**: 危険操作のガード。deny（`sudo` / `git push --force` / `.env` 系・`.dev.vars` 系ファイルの読み書き）、ask（`gh pr merge` / `git reset --hard` / `git clean` / `npm run deploy` / `wrangler pages deploy`）

### サブエージェント（`.claude/agents/`）

- **planner**: 非自明なタスク（3ステップ以上）の実装計画を策定し、Sprint Contract（完了条件）を返す
- **docs-sync**: reviewer の前に起動するドキュメント同期。コード変更に合わせて CLAUDE.md / docs/HARNESS.md / README（日英セット）を更新する。変更がドキュメント記載事項（コマンド・構成・ワークフロー・ユーザー向け機能）に触れる場合のみ
- **reviewer**: タスク完了前の独立コンテキストレビュー。Pass/Fail 判定を返す。Fail があれば修正して再レビュー

### コマンド（`.claude/commands/`）

- **/start-issue <Issue番号>**: GitHub Issue を起点にタスクを開始。Issue 専用 worktree（`.claude/worktrees/issue-{番号}/`）とブランチの作成 → planner → 実装 → 検証 → docs-sync → reviewer → PR 作成（自動レビューフロー起動）まで自走。worktree で作業するため複数 Issue の並列作業が可能
- **/review-pr <PR番号>**: PR のコードレビューを実施し、インラインコメントを投稿
- **/resolve-pr-comments <PR番号>**: PR のレビューコメントを読み取り、修正対応・返信を実施

### PR 自動レビューフロー

`gh pr create` で PR を作成すると、フックが以下のフローを自動起動する：

1. サブエージェントが `/review-pr` の手順で PR をレビューし、インラインコメントを投稿
2. 別のサブエージェントが `/resolve-pr-comments` の手順でコメントに対応（修正・返信）
3. 対応結果のサマリーを報告

※ PR 作成コマンドは単独で実行すること（`git push && gh pr create` のような複合コマンドではフックが発火しない）

### ルール（`.claude/rules/`）

- **workflow-orchestration**: Issue 起点のタスク開始（/start-issue）、planner / docs-sync / reviewer / サブエージェントの使い分けと完了前検証の指針
- **self-review**: タスク完了前に docs-sync によるドキュメント同期と reviewer エージェントによるレビューを必須とするルール

## コードスタイルガイドライン
- コードは TypeScript で記述する
- CSS は CSS Modules を使用する（インラインスタイルは使用しない）
- コンポーネントは React の関数コンポーネントを使用する
- コンポーネントの命名は PascalCase を使用する
- 関数の引数・戻り値には型を明記する
- ファイル名はコンポーネント名と同じにする
- コンポーネントのスタイルは、コンポーネントごとに CSS Modules を使用して分割する
- i18next を使用して多言語対応を行う
- コードのフォーマット&Lintチェックには Biome を使用する（2スペースインデント、ダブルクォート）
- コードの可読性を重視し、コメントは必要に応じて記述し、記述する場合は日本語で記述する
- 実装前に既存のコンポーネントの再利用を検討する

## 最近の更新
- 変換ページに「最適化（形式を維持）」モードを追加（Issue #61）。フォーマットを変換せず、入力と同じ形式のまま再圧縮してファイルサイズを削減する。処理モードのラジオ（「フォーマット変換」/「最適化（形式を維持）」）で切り替え、最適化時は変換用設定（対象フォーマット・品質・目標サイズ・画像サイズ・EXIF 保持）を非表示にする。エンジンは形式ごとに動的 import: PNG は `@jsquash/oxipng`（バイト列→バイト列の可逆最適化・ピクセル不変・Canvas 不要）、JPEG は `@jsquash/jpeg`（mozjpeg。progressive + trellis での高品質再エンコード）、WebP は `@jsquash/webp`（ロスレス入力はロスレス、ロッシー入力は高品質ロッシー再エンコード）。最適化後が元以上なら元を採用（no-worse-than-original）。対応は PNG / JPEG / WebP のみで対応外は失敗通知。バッチは既存ワーカープールに `mode: "optimize"` 分岐を追加し、`Worker` があれば混在バッチを各形式のまま並列最適化、非対応環境・Worker 個別失敗時はメインスレッドの `optimizeImage` にフォールバック。Canvas 非依存の純粋ロジック `optimizeCore.ts`（`resolveOptimizeEngine` / `isOptimizableType` / `pickSmallerSize` / `detectWebpEncoding`、型 `OptimizeEngine` / `WebpEncoding`）と jsquash オーケストレーションの `imageOptimizer.ts`（`optimizeImageBuffer` / `optimizeImage`）を新設、`conversionCore.ts` に `ConversionMode` / `ConversionOptions.mode`、`conversionResult.ts` に `buildOptimizeResult` を追加。UI は `ConversionSettings.tsx`（i18n `convert.mode` 系）。依存追加は `@jsquash/oxipng` / `@jsquash/jpeg` / `@jsquash/webp`（いずれも最適化実行時のみ動的 import で初期バンドル非影響）。単体テストは `optimizeCore.test.ts` / `imageOptimizer.test.ts` / `conversionResult.test.ts`、実ブラウザ検証は `e2e/optimize.spec.ts`（PNG ピクセル不変+削減 / JPEG・WebP 削減 / 混在バッチ / UI）。crop / metadata と convert の既存変換仕様（対応形式・EXIF 保持・目標サイズ・AVIF 出力）は不変
- トリミングページを強化（Issue #31）。(1) アスペクト比プリセット（自由 / 1:1 / 16:9 / 4:3 / 3:2。自由以外はドラッグ・8方向リサイズ・移動が比率固定）、(2) 右/左 90° 回転・左右/上下反転 + EXIF Orientation 自動補正（プレビュー時に `createImageBitmap(imageOrientation: "from-image")` で向きを焼き込み、EXIF 保持時は出力 Orientation を 1 に正規化して二重回転を防止）、(3) 適用範囲の切り替え（「全画像一括」／「画像ごと」。画像ごとは ←/→ と連動して画像単位に領域・回転/反転を保持）を追加。座標計算を Canvas 非依存の純粋ロジック `cropGeometry.ts`（型 `CropArea` / `CropTransform` / `CropState`、`ASPECT_RATIO_PRESETS`、`clampCropArea` / `scaleCropArea` / `toDisplayArea` / `fitAspectRatio` / `enforceAspectRatio` / `orientedSize` / `rotateRight` / `rotateLeft` / `resolveCropForIndex`）に切り出し、`imageCropper.ts` に `renderOrientedImage` / `createOrientedPreviewUrl` を新設、`cropImage` に `transform` / `quality` 引数・`cropImages` に `CropJob[]` を追加、`exifTransfer.ts` に焼き込み済み出力へ EXIF を整合させる `normalizeExifForBakedImage`（Orientation を 1 に正規化 + 実ピクセル寸法タグを出力寸法へ更新）を追加。UI ツールバーは `src/app/crop/components/CropToolbar.tsx`（i18n `crop.*`）。単体テストは `cropGeometry.test.ts` / `exifTransfer.test.ts`、実ブラウザ検証は `e2e/crop.spec.ts`（正方形出力 / 90° 回転 / 画像ごと変換）。crop / metadata の受理形式・convert の仕様は不変（TIFF/HEIC は引き続き crop の入力対象外、AVIF は EXIF 保持・Orientation 正規化の対象外）
- フォルダドロップ・複数投入時の件数上限を追加（Issue #55）。フォルダの再帰取込や multiple 選択で大量ファイルを誤投入すると、サムネイル一斉生成（各画像を `readAsDataURL` でメモリ展開し `Promise.all` で一斉デコード）でタブがフリーズ/メモリ圧迫する問題への対策。ブロッキングの確認ダイアログではなく、ハード上限＋非ブロッキング警告を採用。`constants.ts` に `MAX_INPUT_FILES = 200`、`fileUtils.ts` に純粋関数 `addUniqueFilesWithLimit`（重複除外後に上限で切り詰め `{ files, truncated }` を返す）、`directoryReader.ts` の `collectFilesFromEntries` に収集件数の早期打ち切り（`maxFiles` 引数、残余バジェットを再帰にも伝播）を追加。`FileUploadArea` の共通投入処理 `addFiles` を上限付き（`addUniqueFilesWithLimit(..., MAX_INPUT_FILES)`）に差し替え、フォルダドロップ経路は `collectFilesFromEntries(entries, MAX_INPUT_FILES + 1)` で有界化。超過時は `role="alert"` の警告ボックス（i18n `fileUpload.limitExceeded`、`{{max}}` 補間）を表示しリストクリアでリセット。単体テストは `fileUtils.test.ts` / `directoryReader.test.ts` に追加
- 変換ページのバッチ処理を Web Worker + OffscreenCanvas のワーカープールへ移し、`navigator.hardwareConcurrency` を上限に並列実行するようにした（Issue #32・#47）。AVIF の WASM エンコード（従来メインスレッドで同期実行し UI をフリーズさせていた）も Worker 内で実行する。Worker（`src/workers/`: `imageProcessing.worker.ts` / `imageProcessingPool.ts` / `messages.ts`）とメインスレッドで共有する型・純粋ロジックを Canvas 非依存の `conversionCore.ts`（コア型 + `searchQualityForTargetSize` / `calculateTargetSize`）・`concurrency.ts`（`mapWithConcurrency` / `resolveConcurrency`）・`pngQuality.ts`（`pngQualityStrategy`）・`conversionResult.ts`（`buildConversionResult`）・`decodedImage.ts` に切り出し。OffscreenCanvas 非対応環境や Worker 個別失敗時はメインスレッドの `convertImage` にフォールバック。出力・対応形式・オプション（EXIF 保持・目標ファイルサイズ・品質・リサイズ）の仕様は不変で crop / metadata は変更なし。単体テストは `concurrency.test.ts` / `pngQuality.test.ts`、実ブラウザ検証は `e2e/convert.spec.ts`（一括変換の ZIP 全件検証 / AVIF バッチ / Worker 生成確認）
- PWA 化（オフライン対応・インストール可能化）に対応（Issue #33）。静的エクスポート + Cloudflare Pages 構成に合わせ、ビルドツール非依存の「手書き SW テンプレート（`scripts/sw-template.js`）+ postbuild ジェネレーター（`scripts/generate-sw.ts`）」方式で Service Worker（`out/sw.js`）を生成。`src/app/manifest.ts`（Web App Manifest → `/manifest.webmanifest`）・`public/icons/`（192 / 512 / maskable）・`public/_headers`（sw.js は no-cache 等）・`ServiceWorkerRegister`（本番のみ登録）・`InstallPrompt`（A2HS 導線、i18n `install.*`）を追加。プリキャッシュ判定・URL 変換・キャッシュバージョン（FNV-1a）算出は純粋関数 `precache.ts` に切り出して単体テスト（`precache.test.ts`）。プリキャッシュ URL のハッシュをキャッシュ名に含め、`_next/static/**` が変わったときだけ更新。`skipWaiting` は付けず更新は次回起動時に反映。`postbuild` を `next-sitemap && node scripts/generate-sw.ts` に、`tsconfig.json` の `exclude` に `scripts` を追加。実ブラウザ検証は `e2e/pwa.spec.ts`（manifest / theme-color / 全ルートのオフライン描画）。合否は Lighthouse の PWA カテゴリ廃止（Lighthouse 12）のため DevTools Application パネルと pwa.spec.ts で担保
- 全ページ（convert / crop / metadata）の画像投入方法にクリップボード貼り付け（Ctrl/Cmd+V）とフォルダドロップ（サブフォルダを含む再帰取込）を追加（Issue #35）。共通フック `usePasteImages`（`src/hooks/`）と純粋ロジック `directoryReader.ts` を追加し、`FileUploadArea` の投入処理を共通関数 `addFiles`（`filterValidFiles` → `addUniqueFiles`）に集約。クリップボード取り込みは `fileUtils.ts` の `getFilesFromClipboardData`。非画像や各ページの受理形式外は既存の MIME フィルタで除外。単体テストは `directoryReader.test.ts` / `fileUtils.test.ts`、実ブラウザ検証は `e2e/paste-and-folder-drop.spec.ts`
- EXIF 対応を拡張（Issue #34）。(1) メタデータページで WebP（RIFF の EXIF チャンク）と PNG（eXIf チャンク）の EXIF 読み取りに対応（取り出した TIFF を合成 JPEG に包んで exif-js に渡す）、(2) 変換・トリミングの「EXIF を保持」を JPEG 以外の出力（PNG の eXIf チャンク / WebP の VP8X + EXIF チャンク）でも有効化（AVIF は非対応。convert の preserveExif 有効条件を「JPEG のみ」→「AVIF 以外」に変更）、(3) メタデータページに GPS 位置の処理モード選択（削除 / 市区町村レベルに約 1km 精度で丸める。JPEG のみ有効）を追加。バイナリ操作を純粋関数 `exifBinary.ts`（単体テスト `exifBinary.test.ts`）に、ブラウザ側の読み取り〜書き込みの橋渡しを `exifTransfer.ts` に切り出し。GPS 十進変換・丸めは `metadataManager.ts` に純粋関数として追加。実ブラウザ検証は `e2e/metadata.spec.ts`（WebP / PNG 読み取り・GPS 丸め）・`e2e/convert.spec.ts`（JPEG→PNG / →WebP の EXIF 保持）
- 各ページ（`/`, `/convert`, `/crop`, `/metadata`）に固有の SEO メタデータ（title / description / OGP / Twitter card / canonical）を付与（Issue #27）。`pageMetadata.ts` の純粋関数 `buildPageMetadata` で組み立て、各ルートの `layout.tsx`（サーバーコンポーネント層）から export する。root の `layout.tsx` に `metadataBase`・title テンプレート・共通 description・OGP / Twitter 既定値を集約。主言語は日本語で静的 HTML に出力されるため i18n（ロケール JSON）は非経由。単体テストは `pageMetadata.test.ts`、実 HTML 出力の検証は `e2e/seo-metadata.spec.ts` で実施
- 変換ページに目標ファイルサイズ (KB) 指定を追加（Issue #30）。指定すると品質値を二分探索し目標サイズ以下で最大品質の結果を採用する（JPEG / WebP のみ。PNG は可逆・AVIF は WASM が低速なため対象外）。探索は Canvas 非依存の純粋関数 `searchQualityForTargetSize`（`imageConverter.ts`）に切り出して単体テスト、実サイズ検証は E2E で実施。達成不可時は最小サイズで出力し結果一覧に警告表示
- `/start-issue` コマンドを git worktree 対応に変更。Issue ごとに `.claude/worktrees/issue-{番号}/`（gitignore 済み）へ worktree を作成して作業するため、複数 Issue の並列作業が可能に
- 変換ページに TIFF 入力対応を追加（`utif2` による動的デコード、Issue #26）。crop / metadata の受理形式からブラウザで描画できない TIFF を除外し、変換失敗ファイルの一覧通知を追加
- Next.js を 16 に更新（PR #45）。Turbopack 本番ビルドが無限ハングする上流バグの回避のため `build` スクリプトを `next build --webpack` に暫定変更（dev は Turbopack のまま。上流修正後に戻す）
- 変換ページに HEIC/HEIF 入力対応を追加（libheif WASM による動的デコード、Issue #28）
- 画像フォーマット変換の出力形式に AVIF を追加（`@jsquash/avif` の WASM エンコーダーを動的 import で使用）
- 開発ハーネスを整備（詳細は `docs/HARNESS.md`）: vitest による単体テスト、Claude Code フック（自動フォーマット / 完了時チェック）、サブエージェント（planner / docs-sync / reviewer）、PR 自動レビューフロー、GitHub Actions CI
- `feat/exif-editor` ブランチで EXIF メタデータの選択的削除機能を実装
