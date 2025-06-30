# Web Image Converter

Next.js App Routerを使用した画像変換アプリケーション。ファイルのドラッグ&ドロップ、フォーマット変換、サムネイル表示、ファイル詳細表示機能を備えた再利用可能なコンポーネント構成で作られています。

## 機能

### ✨ 主な機能
- **ファイルドラッグ&ドロップ** - 複数ファイルの同時アップロード対応
- **画像フォーマット変換** - JPEG、PNG、WebP形式への変換
- **品質調整** - 圧縮品質の細かい設定 (1-100%)
- **サイズ変更** - 幅・高さの指定とアスペクト比維持
- **サムネイル表示** - Canvas APIを使用した32x32pxサムネイル自動生成
- **ファイル詳細表示** - EXIF情報と画像プレビュー機能
- **変換結果管理** - 圧縮率表示と個別/一括ダウンロード

### 🎨 デザイン・UI
- **純粋CSS** - TailwindCSSを使用せず、カスタムCSS変数で統一されたデザイン
- **Manropeフォント** - モダンで読みやすいタイポグラフィ
- **レスポンシブ対応** - デスクトップとモバイルデバイスに最適化
- **アクセシビリティ** - セマンティック要素とキーボードナビゲーション対応

### 🛠 技術仕様
- **再利用可能コンポーネント** - 11個のモジュラーコンポーネント設計
- **TypeScript完全対応** - 型安全性の確保
- **React Hooks最適化** - useCallback、useEffectを適切に使用
- **EXIF情報取得** - exif-jsライブラリでカメラ情報表示
- **エラーハンドリング** - 包括的なエラー処理

## 開発環境のセットアップ

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# コード品質チェック
npm run lint

# コードフォーマット
npx biome format src/ --write
```

## 使用技術

- **Framework**: Next.js 15.3.4 (App Router)
- **Language**: TypeScript
- **Styling**: 純粋CSS + CSS変数
- **Linting/Formatting**: Biome
- **Image Processing**: Canvas API
- **EXIF Data**: exif-js + @types/exif-js

## プロジェクト構造

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # ルートレイアウト
│   ├── page.tsx           # メインページ
│   └── globals.css        # グローバルスタイル
├── components/            # 再利用可能コンポーネント
│   ├── Header.tsx         # アプリヘッダー
│   ├── Logo.tsx           # ロゴコンポーネント
│   ├── Navigation.tsx     # ナビゲーション
│   ├── Button.tsx         # ボタンコンポーネント
│   ├── Input.tsx          # 入力フィールド
│   ├── RadioButtonGroup.tsx # ラジオボタングループ
│   ├── FileDropZone.tsx   # ファイルドロップエリア
│   ├── FileList.tsx       # ファイル一覧表示
│   ├── FileDetailModal.tsx # ファイル詳細モーダル
│   ├── ConversionSettings.tsx # 変換設定
│   ├── ConversionResults.tsx # 変換結果表示
│   ├── ProgressBar.tsx    # プログレスバー
│   ├── ImageUploadSection.tsx # 画像アップロードセクション
│   ├── LayoutContainer.tsx # レイアウトコンテナ
│   └── MainContent.tsx    # メインコンテンツ
└── utils/
    └── imageConverter.ts  # 画像変換ユーティリティ
```

## 主要コンポーネント

### FileDropZone
- ドラッグ&ドロップとファイル選択ダイアログ
- 重複ファイル除外機能
- 画像ファイル形式の検証

### ImageConverter
- Canvas APIを使用した画像変換
- 複数ファイルの並列処理
- プログレス表示対応

### FileDetailModal
- 画像プレビュー表示
- EXIF情報の詳細表示
- キーボードショートカット（ESC）対応

## 開発

開発サーバーを起動後、[http://localhost:3000](http://localhost:3000)でアプリケーションにアクセスできます。

### コード品質
- **Biome**: ESLintとPrettierの代替として使用
- **TypeScript**: 厳格な型チェック
- **React Hooks**: Lintルール準拠
