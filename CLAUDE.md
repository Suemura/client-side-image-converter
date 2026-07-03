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

# 本番用ビルド（静的エクスポート）
npm run build

# Cloudflare Pages へのデプロイ
npm run deploy

# デプロイ版のローカルプレビュー
npm run preview
```

## 完了条件（Definition of Done）

コード変更を伴うタスクは、以下がすべて成功した状態で完了とすること：

1. `npm run lint` — Biome によるリント・フォーマットチェック
2. `npm run typecheck` — TypeScript 型チェック
3. `npm run test` — vitest による単体テスト

これらが失敗したまま作業を終了しないこと。なお、応答終了時（Stop フック）に TS/TSX ファイルの変更があると上記 3 つが自動実行され、失敗した場合はエラー内容が差し戻される。

## アーキテクチャ

### 技術スタック
- **フレームワーク**: Next.js 15 with App Router
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
  - `imageCropper.ts` - 画像トリミング処理
  - `metadataManager.ts` - EXIF データ管理
  - `__tests__/` - 単体テスト
- `src/i18n/` - 国際化設定
- `src/types/` - 外部ライブラリの型定義（piexifjs / exif-js）

### パスエイリアス
プロジェクトでは `tsconfig.json` で設定された TypeScript パスエイリアスを使用：
- `@/*` → `src/*`
- `@components/*` → `src/components/*`
- `@utils/*` → `src/utils/*`

※ vitest 用のエイリアスは `vitest.config.ts` にも定義されている。エイリアスを追加する場合は両方を更新すること。

### コア機能
1. **画像フォーマット変換** - JPEG、PNG、WebP 形式間の変換（品質制御付き）
2. **画像トリミング** - プレビュー付きのビジュアルトリミングインターフェース
3. **EXIF メタデータ管理** - EXIF データの表示、編集、選択的削除
4. **バッチ処理** - 複数画像の一括処理
5. **プライバシーファースト** - Canvas API を使用したクライアントサイドでの全処理

### 重要なパターン
- すべての画像処理はクライアントサイド操作のために Canvas API を使用
- EXIF データ処理は保存に `piexifjs`、読み取りに `exif-js` を使用
- テーマ切り替え（ライト/ダーク）は CSS カスタムプロパティで処理
- 言語設定は localStorage に保存
- ファイルダウンロードはバッチ操作に `JSZip` を使用

## テスト方針

- テストランナーは vitest、DOM 環境は happy-dom（`File` / `FileReader` / `localStorage` などのブラウザ API を使用するため）
- テストファイルはテスト対象と同じディレクトリの `__tests__/` に `<対象ファイル名>.test.ts` として配置する
- `src/utils/` のロジックを追加・変更した場合は、対応する単体テストを追加・更新すること
- EXIF 処理のテストは piexifjs でフィクスチャ（EXIF 入り JPEG）を生成して実データで検証する（`metadataManager.test.ts` 参照）
- Canvas API に依存する処理（描画・変換）は happy-dom では動作しないため、単体テストの対象外とする（純粋ロジック部分を切り出してテストする）

## Claude Code ハーネス

### フック（`.claude/settings.json`）

- **PostToolUse (Write|Edit)**: ファイル編集後に Biome で自動フォーマット。編集直後にファイルが書き換わることがあるため、編集が失敗する場合はファイルを読み直すこと
- **PostToolUse (Bash: gh pr create)**: PR 作成を検知し、自動レビューフロー（下記）の開始を指示（スクリプト: `.claude/hooks/pr-created.sh`）
- **Stop**: 応答終了時、TS/TSX ファイルに未コミットの変更があれば lint + typecheck + test を自動実行（スクリプト: `.claude/hooks/check-on-stop.sh`）。失敗するとエラー内容が差し戻されるので修正して再度終了すること

### サブエージェント（`.claude/agents/`）

- **planner**: 非自明なタスク（3ステップ以上）の実装計画を策定し、Sprint Contract（完了条件）を返す
- **reviewer**: タスク完了前の独立コンテキストレビュー。Pass/Fail 判定を返す。Fail があれば修正して再レビュー

### コマンド（`.claude/commands/`）

- **/review-pr <PR番号>**: PR のコードレビューを実施し、インラインコメントを投稿
- **/resolve-pr-comments <PR番号>**: PR のレビューコメントを読み取り、修正対応・返信を実施

### PR 自動レビューフロー

`gh pr create` で PR を作成すると、フックが以下のフローを自動起動する：

1. サブエージェントが `/review-pr` の手順で PR をレビューし、インラインコメントを投稿
2. 別のサブエージェントが `/resolve-pr-comments` の手順でコメントに対応（修正・返信）
3. 対応結果のサマリーを報告

※ PR 作成コマンドは単独で実行すること（`git push && gh pr create` のような複合コマンドではフックが発火しない）

### ルール（`.claude/rules/`）

- **workflow-orchestration**: planner / reviewer / サブエージェントの使い分けと完了前検証の指針
- **self-review**: タスク完了前に reviewer エージェントによるレビューを必須とするルール

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
- `feat/claude-agents` ブランチでサブエージェント（planner / reviewer）・コマンド（/review-pr / /resolve-pr-comments）・PR 自動レビューフローを導入
- `feat/test-harness` ブランチで検証ハーネスを整備（vitest 導入、typecheck/test スクリプト追加、Claude Code フック設定）
- `feat/exif-editor` ブランチで EXIF メタデータの選択的削除機能を実装
