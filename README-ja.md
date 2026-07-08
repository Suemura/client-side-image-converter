# 🔒 Client-Side Image Converter

Next.js App Router を使用した完全にプライバシー重視の画像変換 Web アプリケーションです。
すべての画像処理はブラウザ内で実行されるため、画像がサーバーに送信されることは一切ありません。
JPEG・PNG・WebP・AVIF 形式への画像変換に対応しており、HEIC/HEIF（iPhone で撮影した写真など）や TIFF も変換ページで入力として受け付け、すべてブラウザ内でデコードします。
画像はドラッグ&ドロップやファイル選択に加え、クリップボードからの貼り付け（Ctrl/⌘+V）やフォルダのドロップ（サブフォルダを含む）でも読み込めます。
また PWA（プログレッシブ ウェブ アプリ）に対応しており、一度読み込めば完全にオフラインで動作し、対応ブラウザではホーム画面やデスクトップにインストールできます。

## 🔗 デモサイト

https://image-converter.suemura.app/

## ✨ 主な機能

- **フォーマット変換**: JPEG・PNG・WebP・AVIF への変換（品質制御、目標ファイルサイズ指定は JPEG / WebP に対応）。HEIC/HEIF・TIFF も入力として受け付けます。
- **最適化（形式を維持）**: 形式を変換せず、元の形式のまま再圧縮してファイルサイズを削減します。PNG は完全可逆な最適化（ピクセル不変）、JPEG・WebP は高品質で再エンコードします。削減できない場合は元のファイルをそのまま採用します。対応形式は PNG / JPEG / WebP です。
- **画像トリミング**: プレビュー付きのビジュアルトリミングツール。アスペクト比プリセット（自由 / 1:1 / 16:9 / 4:3 / 3:2）、90° 回転・左右/上下反転（EXIF Orientation の自動補正付き）、「全画像一括」／「画像ごと」に領域・回転を適用できる切り替えに対応。
- **画像編集（ライト/カラー調整）**: 写真アプリ相当の調整 —— ライト（露光量・輝度・コントラスト・ハイライト・シャドウ・白/黒レベル）とカラー（彩度・自然な彩度・色温度・色合い・色相）—— を、Before/After のリアルタイムプレビューを見ながら非破壊で行い、複数画像へまとめて適用できます。描画は WebGL2 シェーダを使い、非対応環境では Canvas2D の CPU パスへ自動フォールバックします（プレビューと出力は同じ描画経路を通るため結果が一致）。出力は元形式維持または JPEG / PNG / WebP / AVIF への変換に対応。
- **EXIF メタデータ管理**: EXIF 情報の表示（JPEG / PNG / WebP に対応）、タグの編集、機微なメタデータの選択的削除。GPS 位置情報は削除に加えて、市区町村レベル（約 1km 精度）に丸めて残すことも選べます（JPEG のみ）。
- **EXIF 情報の保持**: 変換・トリミング・編集時に元画像の EXIF を引き継げます（JPEG / PNG / WebP 出力に対応。AVIF は非対応）。
- **バッチ処理**: 複数画像の一括処理（一度に扱えるのは最大 200 件。上限を超えた分は取り込まれず警告を表示します）。変換ページでは Web Worker（CPU のコア数を上限に並列）で処理するため、大きな画像や大量の画像でも UI が固まりにくくなっています。
- **PWA（インストール・オフライン対応）**: ホーム画面やデスクトップにインストールでき、すべての機能をオフラインで利用できます。初回アクセス時に Service Worker が全アセットをプリキャッシュし、テーマに追従するアプリアイコンと Web App Manifest を備えています。

## 🛡️ プライバシーの特徴

### **完全なローカル処理**

- **サーバー送信なし**: 画像は一切サーバーに送信されません
- **オフライン動作**: 初回アクセス時に Service Worker が全アセットをプリキャッシュするため、インターネット接続なしですべての機能が動作します

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

## 🌐 多言語対応

このアプリケーションは以下の言語をサポートしています：

- 🇯🇵 日本語（デフォルト）
- 🇺🇸 英語

ヘッダーの言語切り替えボタンから、リアルタイムで言語を変更できます。

## 🚀 デプロイ

### Cloudflare Pages へのデプロイ

このアプリケーションは Cloudflare Pages に静的サイトとしてデプロイできます。

#### デプロイ手順

1. **依存関係のインストール**

   ```bash
   npm install
   ```

2. **静的サイトとしてビルド**

   ```bash
   npm run build
   ```

3. **Cloudflare にログイン**

   ```bash
   npx wrangler login
   ```

4. **デプロイ実行**

   ```bash
   npm run deploy
   ```

   または直接：

   ```bash
   npx wrangler pages deploy out --project-name client-side-image-converter
   ```

5. **ローカルプレビュー（オプション）**
   ```bash
   npm run preview
   ```

## 📄 ライセンス

このプロジェクトは [MIT License](LICENSE) の下で公開されています。

### 依存関係のライセンス

このプロジェクトは以下のライセンスを持つオープンソースライブラリを使用しています：

- **MIT License**: Next.js, React 等の主要ライブラリ
- **Apache-2.0 License**: TypeScript 等の一部ライブラリ
- **ISC License**: heic-decode（HEIC/HEIF デコード）
- **LGPL-3.0 License**: libheif-js（HEIC/HEIF デコードに使用する libheif の WASM ビルド。未改変の npm パッケージのままライブラリとして利用し、動的 import による独立チャンクに分離）
- **MPL-2.0 License**: Axe Core（アクセシビリティ検証）

すべての依存関係は商用利用可能なライセンスです。詳細は各ライブラリのライセンスファイルをご確認ください。

## 🤝 Contributing

プルリクエストやイシューの報告を歓迎します！

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📞 サポート

質問やサポートが必要な場合は、[GitHub Issues](https://github.com/Suemura/client-side-image-converter/issues) にお気軽にお問い合わせください。

## 📋 利用可能なスクリプト

```bash
# 開発サーバー起動
npm run dev

# 本番用ビルド
npm run build

# 本番サーバー起動（ビルド後）
npm start

# リンティング
npm run lint

# Cloudflare Pagesデプロイ
npm run deploy

# ローカルでデプロイ版プレビュー
npm run preview
```
