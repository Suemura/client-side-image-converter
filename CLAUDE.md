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
# postbuild で sitemap（next-sitemap）・Service Worker（scripts/generate-sw.ts → out/sw.js）・セキュリティヘッダー / CSP（scripts/generate-headers.ts → out/_headers）を続けて生成する
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

## ドキュメントマップ

このファイルは「毎セッション必要な横断規約 + ポインタ」に絞っている。領域別の詳細は、必要になったときに以下を読むこと：

- `docs/ARCHITECTURE.md` — ディレクトリ / ファイル別の詳細な責務・関数一覧と、コア機能の詳細仕様
- `docs/PATTERNS.md` — 重要な実装パターンの詳細（Worker 構成・最適化エンジン・EXIF バイナリ・編集パイプライン・ツール連携・ファイル投入・PWA キャッシュ戦略等）
- `docs/TESTING.md` — テスト方針の詳細（機能別の単体テスト / E2E 対象一覧）
- `docs/HARNESS.md` — Claude Code ハーネスの全体像・設計意図・運用上の注意
- `DESIGN.md`（リポジトリルート） — デザイン規定（トークン・タイポグラフィ・コンポーネント規定。UI・スタイルに触れる前に読む）

### 本ファイルの編集ルール（肥大化防止・厳守）

本ファイルは毎セッション全文がコンテキストに載る。編集時は以下を守ること：

- **書いてよいもの**: 開発コマンド・完了条件・パスエイリアス・ハーネス構成・コードスタイル、およびディレクトリ / コア機能 / 設計原則 / テスト方針の**ダイジェスト（1 項目 = 1 行）**
- **書いてはいけないもの**（分割ファイルへ）: ファイル別の関数名・型名・props の列挙 → `docs/ARCHITECTURE.md`、実装パターンの詳細 → `docs/PATTERNS.md`、テスト対象の列挙 → `docs/TESTING.md`、タスクの変更ログ → コミットメッセージ / PR 説明（ドキュメントファイルには記録しない）
- **サイズ予算 20KB**: 編集後に `wc -c CLAUDE.md` が 20480 バイトを超える場合は、直近の追記を分割ファイルへ移して縮めること

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

各ファイルの詳細な責務・関数一覧は `docs/ARCHITECTURE.md` を参照。

- `src/app/` - Next.js App Router ページ（`convert/` 変換、`crop/` トリミング、`edit/` 画像編集、`redact/` モザイク / ぼかしレタッチ、`metadata/` EXIF エディター、`share/` 共有シート受け口、`manifest.ts` PWA マニフェスト。ページ固有の UI 部品は `src/app/<page>/components/` 配下）
- `src/components/` - 再利用可能な React コンポーネント（PWA 関連・ツール連携（ハンドオフ）の送出/到着 UI・汎用スライダー等）
- `src/contexts/` - React Context（テーマ・ツール連携の共有ストア）
- `src/utils/` - コアユーティリティ。Canvas / WebGL / WASM 依存のオーケストレーションと、Canvas 非依存の純粋ロジック（単体テスト対象）をファイル単位で分離して配置する
  - `__tests__/` - 単体テスト
- `src/hooks/` - カスタム React フック
- `src/workers/` - Web Worker（変換ページのバッチ処理を並列化）
- `src/i18n/` - 国際化設定
- `src/types/` - 外部ライブラリの型定義（piexifjs / exif-js / heic-decode）
- `scripts/` - ビルド補助スクリプト（`tsconfig.json` の `exclude` に含め tsc 対象外。Service Worker 生成・PWA アイコン / LUT 生成）
- `public/` - 静的アセット（PWA アイコン・同梱プリセット LUT・Cloudflare Pages 用 `_headers`。ビルド時に `out/` へコピーされ配信される）

### パスエイリアス
プロジェクトでは `tsconfig.json` で設定された TypeScript パスエイリアスを使用：
- `@/*` → `src/*`
- `@components/*` → `src/components/*`
- `@utils/*` → `src/utils/*`

※ vitest 用のエイリアスは `vitest.config.ts` にも定義されている。エイリアスを追加する場合は両方を更新すること。

### コア機能

詳細仕様（対応形式・制限・UI 挙動）は `docs/ARCHITECTURE.md` の「コア機能」を参照。

1. **画像フォーマット変換 / 最適化**（`/convert`）- JPEG / PNG / WebP / AVIF / JPEG XL への変換（品質・目標ファイルサイズ指定）と、形式を維持した再圧縮による「最適化」モード。HEIC / TIFF / RAW（CR2 / NEF / ARW / DNG 等）は変換ページのみ入力可
2. **画像トリミング**（`/crop`）- アスペクト比プリセット・回転 / 反転・適用範囲切替（全画像一括 / 画像ごと）。EXIF Orientation は焼き込みで補正
3. **画像編集**（`/edit`）- ライト / カラー / ディテール（シャープネス / 明瞭度 / ビネット / グレイン）調整・効果（モノクロ / ガンマ）・自動補正（WB スポイト含む）・トーンカーブ・LUT フィルタ・ヒストグラム表示。WebGL2 プレビュー + Canvas2D CPU フォールバック（WYSIWYG）
4. **モザイク / ぼかしレタッチ**（`/redact`）- 複数の矩形領域をドラッグ指定してモザイク / ぼかし / 塗りつぶしを焼き込む（既定はモザイク。領域は画像ごとに保持・出力は `_redacted` サフィックスで元形式維持）
5. **EXIF メタデータ管理**（`/metadata`）- 表示（JPEG / PNG / WebP）・編集・選択的削除・GPS 丸め（約 1km 精度）
6. **ツール連携（ハンドオフ）** - 各ツールの処理結果をダウンロードせずに次のツールへ引き継いで続けて処理できる（全 5 ツールの相互連携。送り先候補は「現在のツール以外」かつ「全結果 MIME を受理できるツール」）
7. **バッチ処理・ファイル保存** - 複数画像の一括処理（投入上限 `MAX_INPUT_FILES` = 200 件。変換はワーカープールで並列）。結果は ZIP ダウンロードまたは Chromium 系では File System Access API でフォルダへ直接保存可
8. **プライバシーファースト** - Canvas API / WASM / WebGL によるクライアントサイドでの全処理（サーバー送信なし）
9. **PWA** - オフライン対応・ホーム画面 / デスクトップへインストール可能。インストール済み PWA はスマホの共有シートから画像を直接受け取れる（Web Share Target、受け口 `/share`）

### 重要な設計原則

領域別の詳細パターン（Worker 構成・最適化エンジン・EXIF バイナリ・LUT / トーンカーブ / 自動補正のミラー構造・ツール連携・ファイル投入・PWA キャッシュ戦略等）は `docs/PATTERNS.md` を参照。**該当領域に触れる前に必ず読むこと**。

- **クライアントサイド完結**: 画像処理は Canvas API / WASM / WebGL のみで行い、画像をサーバーへ送信しない
- **純粋ロジックの分離**: Canvas / WebGL / DOM 依存のオーケストレーションから Canvas 非依存の純粋ロジックを別ファイルへ切り出し、単体テスト対象にする（例: `conversionCore.ts` / `cropGeometry.ts` / `adjustments.ts` / `handoff.ts` / `precache.ts`）
- **WYSIWYG**: プレビューと出力は同一の描画経路を通す。GPU（GLSL）と CPU（TS）で同じ処理を持つ場合は TS 側の関数を「唯一の真実」とし、GLSL は同順序・同係数でミラーする
- **動的 import**: WASM コーデック（`@jsquash/*` / libheif / utif2 / libraw-wasm 等）と重量 JS ライブラリ（jszip / piexifjs / exif-js）は使用時のみロードし、初期バンドルへ影響させない
- **dual-store**: 適用範囲（全画像一括 / 画像ごと）は crop 起源の dual-store パターンを踏襲する（`resolveCropForIndex` / `resolveAdjustmentForIndex` 等）
- **i18n**: ユーザー向け文言はすべて react-i18next 経由（日英）。ページ別 SEO メタデータのみ静的 HTML（主言語は日本語）

## テスト方針

機能別の単体テスト / E2E の対象一覧は `docs/TESTING.md` を参照。

- テストランナーは vitest、DOM 環境は happy-dom。テストファイルはテスト対象と同じディレクトリの `__tests__/` に `<対象ファイル名>.test.ts` として配置する
- `src/utils/` のロジックを追加・変更した場合は、対応する単体テストを追加・更新すること
- Canvas API / WASM / WebGL に依存する処理（描画・変換・エンコード）は happy-dom では動作しないため単体テストの対象外とし、純粋ロジック部分を切り出してテストする。実描画・実ブラウザ動作は Playwright E2E（`e2e/`）で検証し、ダウンロード物はバイナリ解析で中身まで検証する
- E2E のフィクスチャはバイナリを置かず `e2e/helpers/fixtures.ts` で実行時生成する。E2E は本番同等の静的エクスポート（`npm run build` + `serve out`、ポート 3100）に対して実行される

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

起動時は差分（`git diff --stat` 等）と変更概要をプロンプトに手渡す（探索削減。`self-review.md` 参照）。

- **planner**: 非自明なタスク（3ステップ以上）の実装計画を策定し、Sprint Contract（完了条件）を返す
- **docs-sync**（haiku）: ドキュメント同期。起動条件は `self-review.md` のホワイトリスト（ユーザー向け機能 / コマンド・CI / ハーネス / 構造・テスト方針の変更）のみ
- **reviewer**（sonnet）: **PR を作らないタスク専用**の完了前独立レビュー。Pass/Fail 判定を返す。PR を作るタスクでは起動しない（PR 自動レビューに一本化）
- **pr-reviewer / pr-comment-resolver**（sonnet）: PR 自動レビューフロー用。command の手順（review-pr / resolve-pr-comments）に従う薄いラッパー

### コマンド（`.claude/commands/`）

- **/start-issue <Issue番号>**: GitHub Issue を起点にタスクを開始。Issue 専用 worktree（`.claude/worktrees/issue-{番号}/`）とブランチの作成 → planner → 実装 → 検証（lint / typecheck / test + Sprint Contract 自己チェック）→ docs-sync → PR 作成（自動レビューフロー起動）まで自走。worktree で作業するため複数 Issue の並列作業が可能
- **/review-pr <PR番号>**: PR のコードレビューを実施し、インラインコメントを投稿
- **/resolve-pr-comments <PR番号>**: PR のレビューコメントを読み取り、修正対応・返信を実施

### PR 自動レビューフロー

`gh pr create` で PR を作成すると、フックが以下のフローを自動起動する：

1. **pr-reviewer** が `/review-pr` の手順で PR をレビューし、インラインコメントを投稿
2. **pr-comment-resolver** が `/resolve-pr-comments` の手順でコメントに対応（修正・返信。TS/TSX 修正時は lint / typecheck / test 必須）
3. 対応結果のサマリーを報告

※ PR 作成コマンドは単独で実行すること（`git push && gh pr create` のような複合コマンドではフックが発火しない）

### ルール（`.claude/rules/`）

- **workflow-orchestration**: Issue 起点のタスク開始（/start-issue）、サブエージェントの使い分け・コンテキスト手渡しと完了前検証の指針
- **self-review**: 完了前の独立レビューの二本立て（PR あり = PR 自動レビュー / PR なし = reviewer）と docs-sync 起動条件ホワイトリストを定義するルール

## コードスタイルガイドライン
- コードは TypeScript で記述する
- UI・スタイルの追加/変更はリポジトリルートの `DESIGN.md`（デザイン規定）に準拠する。色は必ず CSS カスタムプロパティ（トークン）を参照し、ハードコードしない
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

## 変更履歴の扱い

実装履歴はコミットメッセージと PR 説明が single source of truth（`git log` / `gh pr view` で参照）。変更ログ用のドキュメントファイルは持たない（本ファイルにも書かない）。ハーネス構成の変更経緯のみ `docs/HARNESS.md` の変更履歴に記録する。
