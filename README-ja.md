# 🔒 Client-Side Image Converter

Next.js App Router を使用した完全にプライバシー重視の画像変換 Web アプリケーションです。
すべての画像処理はブラウザ内で実行されるため、画像がサーバーに送信されることは一切ありません。

## 🔗 デモサイト

https://image-converter.suemura.app/

## 🛡️ プライバシーの特徴

### **完全なローカル処理**

- **サーバー送信なし**: 画像は一切サーバーに送信されません
- **オフライン動作**: 一度読み込めば、インターネット接続なしで動作します

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

- **MIT License**: Next.js, React, TypeScript等の主要ライブラリ
- **Apache-2.0 License**: 一部のユーティリティライブラリ
- **LGPL-3.0 License**: Sharp画像処理ライブラリ（ライブラリとして利用）
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
