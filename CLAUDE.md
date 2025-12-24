# CLAUDE.md

このファイルは、このリポジトリでコードを扱う際の Claude Code (claude.ai/code) へのガイダンスを提供します。

## プロジェクト概要

Next.js App Router で構築されたプライバシー重視のクライアントサイド画像変換ウェブアプリケーション。すべての画像処理はブラウザ内で実行され、画像がサーバーに送信されることはありません。

## 開発コマンド

```bash
# 依存関係のインストール（yarn v4を使用）
yarn install

# Turbopack による開発サーバーの起動
npm run dev

# リンティングの実行
npm run lint

# Biome によるコードフォーマット
npx biome format src/ --write

# 本番用ビルド（静的エクスポート）
npm run build

# Cloudflare Pages へのデプロイ
npm run deploy

# デプロイ版のローカルプレビュー
npm run preview
```

## アーキテクチャ

### 技術スタック
- **フレームワーク**: Next.js 15 with App Router
- **言語**: TypeScript（strict モード）
- **スタイリング**: CSS Modules
- **i18n**: react-i18next（日本語/英語サポート）
- **リンター/フォーマッター**: Biome（ESLint/Prettier の代替）
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
- `src/i18n/` - 国際化設定

### パスエイリアス
プロジェクトでは `tsconfig.json` で設定された TypeScript パスエイリアスを使用：
- `@/*` → `src/*`
- `@components/*` → `src/components/*`
- `@utils/*` → `src/utils/*`

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

### コードスタイルガイドライン
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
プロジェクトは最近 `feat/exif-editor` ブランチで EXIF メタデータの選択的削除機能を実装しました。