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
  - `crop/` - 画像トリミングツールページ  
  - `metadata/` - EXIF メタデータエディターページ
- `src/components/` - 再利用可能な React コンポーネント
- `src/utils/` - コアユーティリティクラス
  - `imageConverter.ts` - 画像フォーマット変換処理
  - `avifEncoder.ts` - AVIF エンコード処理（`@jsquash/avif` の WASM を動的 import）
  - `heicDecoder.ts` - HEIC/HEIF デコード処理（libheif WASM、動的 import）
  - `imageCropper.ts` - 画像トリミング処理
  - `metadataManager.ts` - EXIF データ管理
  - `__tests__/` - 単体テスト
- `src/i18n/` - 国際化設定
- `src/types/` - 外部ライブラリの型定義（piexifjs / exif-js / heic-decode）

### パスエイリアス
プロジェクトでは `tsconfig.json` で設定された TypeScript パスエイリアスを使用：
- `@/*` → `src/*`
- `@components/*` → `src/components/*`
- `@utils/*` → `src/utils/*`

※ vitest 用のエイリアスは `vitest.config.ts` にも定義されている。エイリアスを追加する場合は両方を更新すること。

### コア機能
1. **画像フォーマット変換** - JPEG、PNG、WebP、AVIF 形式への変換（品質制御付き。AVIF は出力のみ対応）。HEIC/HEIF（iPhone 写真）は変換ページのみ入力として受理（crop / metadata はブラウザがプレビュー描画できないため対象外）
2. **画像トリミング** - プレビュー付きのビジュアルトリミングインターフェース
3. **EXIF メタデータ管理** - EXIF データの表示、編集、選択的削除
4. **バッチ処理** - 複数画像の一括処理
5. **プライバシーファースト** - Canvas API / WASM を使用したクライアントサイドでの全処理

### 重要なパターン
- 画像処理はクライアントサイド操作のために Canvas API を使用
- AVIF エンコードのみ Canvas の `toBlob("image/avif")` が全ブラウザ未実装のため、`@jsquash/avif`（WASM）を動的 import で使用（AVIF 変換実行時のみロードされ、初期バンドルに影響しない。処理はブラウザ内で完結）
- HEIC/HEIF のデコードは libheif の WASM ビルド（`heic-decode` + `libheif-js`）を使用し、動的 import により HEIC 変換時のみロードする（初期バンドルに影響なし）
- HEIC は MIME タイプが空になるブラウザがあるため、拡張子（.heic/.heif）によるフォールバック判定を行う（`fileUtils.ts` の `isHeicFile`）
- EXIF データ処理は保存に `piexifjs`、読み取りに `exif-js` を使用
- テーマ切り替え（ライト/ダーク）は CSS カスタムプロパティで処理
- 言語設定は localStorage に保存
- ファイルダウンロードはバッチ操作に `JSZip` を使用

## テスト方針

- テストランナーは vitest、DOM 環境は happy-dom（`File` / `FileReader` / `localStorage` などのブラウザ API を使用するため）
- テストファイルはテスト対象と同じディレクトリの `__tests__/` に `<対象ファイル名>.test.ts` として配置する
- `src/utils/` のロジックを追加・変更した場合は、対応する単体テストを追加・更新すること
- EXIF 処理のテストは piexifjs でフィクスチャ（EXIF 入り JPEG）を生成して実データで検証する（`metadataManager.test.ts` 参照）
- Canvas API や WASM に依存する処理（描画・変換・エンコード）は happy-dom では動作しないため、単体テストの対象外とする（純粋ロジック部分を切り出してテストする）
- Canvas 依存の動作は Playwright E2E（`e2e/`）で実ブラウザ検証する。ダウンロード物はマジックナンバーや piexifjs のバイナリ解析で中身まで検証する（`e2e/metadata.spec.ts` 参照）
- E2E のフィクスチャはバイナリを置かず `e2e/helpers/fixtures.ts` で実行時生成する
- E2E は本番同等の静的エクスポート（`npm run build` + `serve out`、ポート 3100）に対して実行される。ローカルで高速に回したい場合は `npm run dev -- --port 3100` を別途起動しておけば `reuseExistingServer` により再利用される（CI では常に build + 静的配信）

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

- **/start-issue <Issue番号>**: GitHub Issue を起点にタスクを開始。ブランチ作成 → planner → 実装 → 検証 → docs-sync → reviewer → PR 作成（自動レビューフロー起動）まで自走
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
- Next.js を 16 に更新（PR #45）。Turbopack 本番ビルドが無限ハングする上流バグの回避のため `build` スクリプトを `next build --webpack` に暫定変更（dev は Turbopack のまま。上流修正後に戻す）
- 変換ページに HEIC/HEIF 入力対応を追加（libheif WASM による動的デコード、Issue #28）
- 画像フォーマット変換の出力形式に AVIF を追加（`@jsquash/avif` の WASM エンコーダーを動的 import で使用）
- 開発ハーネスを整備（詳細は `docs/HARNESS.md`）: vitest による単体テスト、Claude Code フック（自動フォーマット / 完了時チェック）、サブエージェント（planner / docs-sync / reviewer）、PR 自動レビューフロー、GitHub Actions CI
- `feat/exif-editor` ブランチで EXIF メタデータの選択的削除機能を実装
