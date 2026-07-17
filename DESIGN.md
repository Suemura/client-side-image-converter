# DESIGN.md — デザイン規定

> 本規定は [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)（MIT ライセンス）の
> vercel テンプレートの構造・トーンを基に、本サイト（Web Image Converter）専用に策定したものである。
> Vercel 固有のマーケティング規定（hero band / pricing card / メッシュグラデーション等）や
> Geist フォント前提は採用していない。
>
> UI・スタイルの追加/変更は本規定に準拠すること。規定にないケースは
> 「10. Iteration Guide」の手順で本書を先に更新してから実装する。

## 1. Overview

本サイトはプライバシー重視のクライアントサイド画像ツール（変換 / トリミング / 編集 / EXIF 管理）である。
デザインの基調は **清潔・機能的・控えめ**。装飾より可読性と操作の明瞭さを優先する。

- **無彩色のキャンバスに単一のブルーアクセント**。彩度の高い色はアクセント（リンク・選択状態・プライマリアクション）と
  セマンティック色（成功 / 警告 / エラー）に限定する
- **境界線（ヘアライン）が構造を語る**。重い影・グラデーション・大きな色面で区切らない
- **ライト / ダークの完全対等**。すべての UI は両テーマで同じ意味・同じ視認性を持つ
- ツールという性格上、**状態（選択中・処理中・成功・失敗）の判別が最優先**。迷ったら「状態が読めるか」で判断する

## 2. Colors

すべての色は `src/app/globals.css` の CSS カスタムプロパティ（トークン）として定義し、
module.css からは必ず `var(--...)` で参照する。**hex / rgb() の直書きは禁止**
（例外は「8. Do's and Don'ts」の画像上オーバーレイ UI のみ）。

テーマは `<html data-theme="light|dark">` で切り替わる。トークンは `:root`（ライト）と
`[data-theme="dark"]`（ダーク）で二重定義する。

### 基本色

| トークン | ライト | ダーク | 用途 |
| --- | --- | --- | --- |
| `--background` | `#fafafa` | `#0a0a0a` | ページ背景 |
| `--foreground` | `#171717` | `#ededed` | 本文テキスト・見出し |
| `--surface` | `#ffffff` | `#141414` | カード・パネル・入力欄の背景 |
| `--surface-muted` | `#f5f5f5` | `#1f1f1f` | 一段沈んだ背景（無効状態・インセット領域・トラック） |
| `--border` | `#e5e5e5` | `#262626` | 標準の境界線（ヘアライン） |
| `--border-strong` | `#cfcfcf` | `#3d3d3d` | 強調境界（ドロップ領域の破線・hover 時の境界） |
| `--muted-foreground` | `#525252` | `#a1a1a1` | 補助テキスト・ラベル |
| `--faint-foreground` | `#8f8f8f` | `#707070` | プレースホルダ・微細な注記（**14px 以上の文字専用**） |

### アクセント

| トークン | ライト | ダーク | 用途 |
| --- | --- | --- | --- |
| `--accent` | `#0068d6` | `#52a9ff` | リンク・選択状態・プライマリボタン背景・フォーカスリング |
| `--accent-foreground` | `#ffffff` | `#0a0a0a` | アクセント背景上のテキスト |
| `--accent-soft` | `#e6f1fe` | `#0d2237` | 選択チップ・情報ボックス・ドラッグ中ハイライト等の淡い背景 |

### セマンティック色

| トークン | ライト | ダーク | 用途 |
| --- | --- | --- | --- |
| `--success` | `#047857` | `#34d399` | 成功テキスト / アイコン |
| `--success-soft` | `#ecfdf5` | `#0a2b1d` | 成功の淡い背景 |
| `--warning` | `#b45309` | `#fbbf24` | 警告テキスト / アイコン |
| `--warning-soft` | `#fffbeb` | `#2a2008` | 警告の淡い背景 |
| `--error` | `#d41d1d` | `#f87171` | エラーテキスト / アイコン |
| `--error-soft` | `#fef2f2` | `#2d1215` | エラーの淡い背景 |
| `--overlay` | `rgba(0, 0, 0, 0.5)` | `rgba(0, 0, 0, 0.65)` | モーダルの背景幕 |

セマンティック色は**その意味でのみ**使う。「赤っぽい飾りが欲しい」等の装飾目的での流用は禁止。
情報（info）の通知には `--accent` / `--accent-soft` を使う。

### コントラスト基準（変更時もこれを維持すること）

- 本文テキストは背景に対して **4.5:1 以上**、大きめ文字（18px 以上または 14px 太字以上）は **3:1 以上**
- **状態を伝えるインジケータ**（フォーカスリング・選択状態の境界・単独で意味を持つアイコン等。WCAG 1.4.11 相当）は
  隣接色に対して **3:1 以上**。`--accent` はこの用途を満たすことをトークン側で保証する
- **ヘアライン境界（`--border` / `--border-strong`）はこの基準の対象外**（装飾的な区切りとして扱う）。
  部品の識別はテキスト・背景差・フォーカスリングで担保し、境界線のコントラストには依存しない
- `--foreground` / `--muted-foreground` は `--background` と `--surface` の両方に対して 4.5:1 以上
- `--accent` はライト / ダークとも背景上のテキストとして 4.5:1 以上、かつ `--accent-foreground` との組で 4.5:1 以上、
  `--accent-soft` 上のテキストとしても 4.5:1 以上
- `--success` / `--warning` / `--error` は対応する `-soft` 背景上および `--surface` 上で 4.5:1 以上
- `--faint-foreground` のみ 3:1 以上でよい（そのため 14px 未満の本文には使わない）

※ 現行値はテキスト / インジケータ系の全 30 ペアが上記を満たすことを機械検証済み
（ヘアライン境界は上記のとおり対象外。ライトの `--error` は基準達成のため
`#dc2626` から `#d41d1d` に調整した経緯がある）。

## 3. Typography

フォントは `next/font/google` の **Manrope + Noto Sans**（`--font-manrope` / `--font-noto-sans`）。変更しない。
ウェイトの上限は **700**。ロードするウェイトも 400 / 500 / 700 のみとし、
使わないウェイト（Manrope の 800 / Noto Sans の 900 等）を `weight` 配列に含めない。

| 役割 | サイズ / ウェイト | 行高 | 備考 |
| --- | --- | --- | --- |
| ページタイトル | 28px / 700 | 1.3 | 1 ページ 1 箇所 |
| セクション見出し | 20px / 700 | 1.4 | パネルのタイトル等 |
| 小見出し | 16px / 500 | 1.5 | カード見出し・フォームラベル |
| 本文 | 16px / 400 | 1.5 | |
| 補足 | 14px / 400 | 1.5 | 説明文・メタ情報 |
| キャプション | 12px / 400 | 1.4 | ヒント・単位表示 |
| UI 小型ラベル | 13px / 400–500 | 1.4 | コンポーネント内専用（Button small・Slider ラベル・進捗数値等。「7. Components」の規定に従う） |
| UI 極小ラベル | 11px / 600 | 1.4 | ThemeSwitch / LanguageSwitch のラベル専用。本文・説明文には使わない |

- 見出し（ページタイトル・セクション見出し）の letter-spacing は **-0.01em**。本文はデフォルト
- 数値の羅列（ファイルサイズ・座標・%）には `font-variant-numeric: tabular-nums` を使う
- 文字色は見出し / 本文 = `--foreground`、補足 = `--muted-foreground`、
  プレースホルダ等 = `--faint-foreground`（14px 以上のみ）

## 4. Layout

### スペーシングスケール

4px 基数のスケールのみ使う: **4 / 8 / 12 / 16 / 24 / 32 / 48 / 64**（px）。
`13px` `15px` のような中途半端な値を新規に書かない。

- カード / パネル内 padding: **16–24px**
- セクション間の縦余白: **48–64px**
- ボタン行・チップ行など兄弟要素間の gap: **8–12px**
- ラベルと入力の間: **8px**

### コンテンツ最大幅（現行踏襲）

| 領域 | 最大幅 |
| --- | --- |
| トップページ | 1300px |
| 作業系ページ（/crop・/edit のワイドレイアウト） | 1400px |
| 文書系・一覧系（/metadata・フッター） | 1200px |
| 設定パネル（/convert） | 960px |

新規ページは用途の近い既存値に合わせる。

## 5. Elevation & Depth

影は 3 段階のみ。**単発の重いドロップシャドウは使わない**（小さいオフセットの重ね影で構成する）。

| トークン | 値 | 用途 |
| --- | --- | --- |
| `--shadow-sm` | `0 1px 1px rgba(0,0,0,0.02), 0 2px 4px rgba(0,0,0,0.04)` | カードの浮き |
| `--shadow-md` | `0 2px 4px rgba(0,0,0,0.04), 0 8px 16px -4px rgba(0,0,0,0.06)` | ドロップダウン・ポップオーバー・通知パネル |
| `--shadow-lg` | `0 1px 1px rgba(0,0,0,0.02), 0 8px 16px -4px rgba(0,0,0,0.05), 0 24px 32px -8px rgba(0,0,0,0.08)` | モーダル |

**ダークテーマでは影がほぼ見えない**ため、階層表現は border を主とする:
浮いている要素（カード・モーダル・ポップオーバー）には必ず `1px solid var(--border)` を付け、
影はライトテーマ向けの補助表現と位置づける（角丸・影はテーマで値を変えない）。

## 6. Shapes

角丸は 4 段階のみ。

| トークン | 値 | 用途 |
| --- | --- | --- |
| `--radius-sm` | `6px` | 入力・ボタン・小さなチップ |
| `--radius-md` | `8px` | カード・パネル・通知ボックス |
| `--radius-lg` | `12px` | モーダル・大カード・ドロップ領域 |
| `--radius-full` | `9999px` | ピル・円形（スイッチ・進捗バー・選択チップ） |

## 7. Components

対話要素の共通規定:

- **フォーカス**: キーボードフォーカスには `:focus-visible` で
  `outline: 2px solid var(--accent); outline-offset: 2px` のフォーカスリングを表示する（マウス操作では出さない）
- **無効状態**: `opacity: 0.6; cursor: not-allowed`（色の差し替えではなく透明度で統一）
- **トランジション**: 色・境界・影の変化は `0.15s ease` 程度。レイアウトが動くアニメーションは追加しない

### Button（`src/components/Button`）

| | primary | secondary |
| --- | --- | --- |
| 背景 | `--accent` | `--surface` |
| 文字 | `--accent-foreground` | `--foreground` |
| 境界 | なし | `1px solid var(--border)` |
| hover | `filter: brightness(1.08)` | 背景 `--surface-muted`・境界 `--border-strong` |

- 角丸 `--radius-sm`、ウェイト 500
- サイズ: small = 高さ 32px / padding 0 12px / 13px、medium = 高さ 40px / padding 0 16px / 14px、
  large = 高さ 48px / padding 0 24px / 16px
- disabled は共通規定（opacity 0.6）。hover 効果は付けない

### Input（`src/components/Input`）

- 背景 `--surface`、文字 `--foreground`、境界 `1px solid var(--border)`、角丸 `--radius-sm`
- 高さ 40px、padding 0 12px、フォント 14px。ラベルは小見出し規定（14–16px / 500）
- プレースホルダ `--faint-foreground`
- focus: 境界 `--accent` + `box-shadow: 0 0 0 3px var(--accent-soft)`（入力系のフォーカスリング）
- disabled: 背景 `--surface-muted`・文字 `--muted-foreground`

### RadioButtonGroup（チップ型単一選択）

- 未選択: 背景 `--surface`、文字 `--foreground`（14px / 500）、境界 `1px solid var(--border)`
- 選択中: 背景 `--accent-soft`、文字 `--accent`、境界 `1px solid var(--accent)`
- **境界幅は状態で変えない**（選択で 3px にする等はレイアウトが動くため禁止）
- 角丸 `--radius-full`（ピル）、高さ 40px、padding 0 16px
- hover（未選択）: 境界 `--border-strong`
- キーボードフォーカスは `:focus-visible` 相当（hidden input のためラベル側に `:has(input:focus-visible)` で可視化する。マウス操作ではリングを出さない）

### Slider（`src/components/Slider`）

- ネイティブ `input[type="range"]` に `accent-color: var(--accent)`
- ラベル 13px / 500 `--foreground`、数値は tabular-nums で `--muted-foreground`
- リセットボタン: 24px 角のアイコンボタン。境界 `1px solid var(--border)`・角丸 `--radius-sm`、
  hover で境界 `--border-strong`

### ThemeSwitch / LanguageSwitch

2 つのスイッチは同一の見た目とする。

- トラック: 背景 `--surface-muted`、境界 `1px solid var(--border)`、角丸 `--radius-full`
- つまみ: 背景 `--surface`、境界 `1px solid var(--border-strong)`、`--shadow-sm`、角丸 `--radius-full`
- ラベル: アクティブ側 `--foreground`（11px / 600 前後）、非アクティブ側 `--muted-foreground`

### FileUploadArea（ドロップ領域）

- 通常時: `2px dashed var(--border-strong)`、角丸 `--radius-lg`、背景は透過（ページ背景の上に置く）
- タイトル 16px / 500 `--foreground`、説明 14px `--muted-foreground`、ヒント 12px `--muted-foreground`
  （`--faint-foreground` は 14px 以上専用のため 12px のヒントには使わない）
- ドラッグ中: 境界 `--accent`（破線のまま）+ 背景 `--accent-soft`。オーバーレイ文言は `--accent`
- ファイル一覧の行: 背景 `--surface`、境界 `1px solid var(--border)`、角丸 `--radius-md`、
  hover で背景 `--surface-muted`

### カード / パネル（設定パネル・結果一覧・機能カード等）

- 背景 `--surface`、境界 `1px solid var(--border)`、角丸 `--radius-md`、`--shadow-sm`、padding 16–24px
- タイトルは小見出し規定（16px / 500）を基本とし、**ページの主要セクションを担うカード / パネル**
  （トップページの機能カード・/convert の設定パネル等）はセクション見出し規定（20px / 700）を用いる
- パネル内で一段沈める領域（インセット・無効表示）は `--surface-muted`
- ページ背景（`--background`）の上に `--surface` のカードが乗る、の 2 層を基本とし、3 層以上重ねない

### モーダル（ImageComparisonModal / FileDetailModal）

- 背景幕: `--overlay`（`backdrop-filter: blur(4px)` は任意）
- パネル: 背景 `--surface`、境界 `1px solid var(--border)`、角丸 `--radius-lg`、`--shadow-lg`
- ヘッダー: padding 16px 24px、`border-bottom: 1px solid var(--border)`、タイトルはセクション見出し規定
- 全画面表示のモーダル（比較ビュー等）は角丸なし・背景 `--background` でよい

### 通知ボックス（情報 / 成功 / 警告 / エラー）

- 背景 `-soft` トークン、境界 `1px solid` の対応セマンティック色、角丸 `--radius-md`、padding 12px 16px
- 文言・アイコンは対応するセマンティック色（`-soft` 背景上で 4.5:1 を満たすことをトークン側で保証済み）
- 情報は `--accent` / `--accent-soft` を使う

### ProgressBar

- トラック: 背景 `--surface-muted`、高さ 8px、角丸 `--radius-full`
- バー: 背景 `--accent`、角丸 `--radius-full`
- 進捗数値は 13–14px の tabular-nums で `--muted-foreground`

### Mobile Menu（ハンバーガー + 右ドロワー）

`max-width: 768px` でヘッダーの Navigation / GitHub リンク / ThemeSwitch / LanguageSwitch を
ドロワーへ収納し、ヘッダー右端にはハンバーガーボタンのみを置く（769px 以上ではハンバーガーを表示しない）。

- ハンバーガーボタン: 40×40px、背景 `--surface`、境界 `1px solid var(--border)`、角丸 `--radius-sm`、
  アイコンは `--foreground`。`aria-expanded` / `aria-controls` を付与する
- ドロワー: 画面右端から幅 300px でスライドイン（`transform` 0.2s ease）。
  背景 `--surface`、`border-left: 1px solid var(--border)`、`--shadow-lg`、高さ 100dvh
- ドロワーヘッダー: 「メニュー」見出し（16px / 700）+ 閉じるボタン（40×40px、ハンバーガーと同仕様）、
  `border-bottom: 1px solid var(--border)`
- ナビリンク: 縦積み、高さ 48px、padding 0 12px、16px / 500、角丸 `--radius-sm`。
  非現在ページ `--foreground`、hover 背景 `--surface-muted`、
  **現在ページは背景 `--accent-soft` + 文字 `--accent`**（`aria-current="page"` を付与）
- 設定行（テーマ / 言語）: ラベル（14px / `--muted-foreground`）左 + 既存の ThemeSwitch / LanguageSwitch 右。
  ナビとの間は `1px solid var(--border)` の区切り線
- GitHub リンク: 区切り線の下、外部リンク規定（`--muted-foreground`、hover で `--foreground`）
- 背景幕: `--overlay`。クリックで閉じる
- 挙動: Escape で閉じる・開いている間は body スクロールロック・開時に閉じるボタンへフォーカス移動 /
  閉時にハンバーガーへフォーカス復帰・ページ遷移で自動クローズ（モーダルの挙動規定に準ずる）

### Header / Navigation / Footer

- Header: 背景 `--background`、`border-bottom: 1px solid var(--border)`、padding 12px 24–40px。
  サイトタイトル 18px / 700 / letter-spacing -0.01em
- Navigation: リンクは 14px / 500。非現在ページ `--muted-foreground`、hover / 現在ページ `--foreground`
- 外部リンク（GitHub 等）: `--muted-foreground`、hover で `--foreground`
- Footer: 背景 `--background`、`border-top: 1px solid var(--border)`、本文 14px `--muted-foreground`、
  リンク hover で `--foreground`

## 8. Do's and Don'ts

### Do

- 色は必ず `var(--...)` で参照する
- 新しい色が必要になったら、先に本書と `globals.css` にトークンを追加してから使う（勝手に hex を書かない）
- 状態変化（hover / focus / selected / disabled）は色・境界の変化で表現し、サイズ・境界幅の変化を避ける
- ダークテーマの階層は border で表現する（影に頼らない）
- スペーシング・角丸・影・文字サイズは本書のスケールから選ぶ

### Don't

- **ハードコード色の禁止**: module.css / インラインに hex・`rgb()` を書かない（下記の例外を除く）
- **セマンティック色の目的外使用の禁止**: `--error` を「目立つ赤」として装飾に使う等
- **新しい彩度の高いアクセント色の追加禁止**: アクセントはブルー 1 系統のみ
- **インラインスタイルの禁止**: スタイルは CSS Modules に書く（コードスタイルガイドライン準拠）
- 非推奨エイリアス（`--primary` / `--border-light` / `--border-dashed`）を新規コードで参照しない

### 例外: 動的値の style 属性渡し

スライダー位置・進捗率・クリップ範囲など、**実行時に計算される値**を CSS へ渡す場合に限り、
`style` 属性（または CSS カスタムプロパティ経由）での受け渡しを認める。静的なスタイルは含めず、
動的値である旨を日本語コメントで明記する。

### 例外: 画像の上に重なる UI

クロップ選択枠・8 方向ハンドル・グリッド線・Before/After 比較スライダーのハンドル・画像上の暗幕など、
**任意の画像の上に直接重なる UI に限り、テーマ非依存の固定色を使ってよい**。
どんな画像（明るい / 暗い / 彩度の高い）上でも視認できる配色（白 + 黒縁取り、`rgba(0,0,0,x)` の暗幕等）を選び、
固定色である旨と理由を CSS コメント（日本語）で明記する。
ヒストグラムの R/G/B 波形のような**データ可視化色**も同様に固定色でよい（ただし両テーマの背景上で
視認できる不透明度にする）。

## 9. Responsive Behavior

デスクトップ基準で `@media (max-width: ...)` により縮小方向へ適応する（現行運用の明文化）。

| ブレークポイント | 用途 |
| --- | --- |
| `max-width: 1200px` | ワイドレイアウト（/crop・/edit の 2 カラム）の余白・カラム幅圧縮 |
| `max-width: 900px` | 2 カラム → 1 カラムへの切替（/crop・/edit） |
| `max-width: 768px` | 標準のモバイル切替（**ヘッダーナビ → ハンバーガー + ドロワー**・フッター段組解除・モーダル余白縮小・ページ余白 16px 化等） |
| `max-width: 640px` | 最終段の圧縮（ヘッダーの文字ラベル省略は 768px でドロワーへ移行したため廃止） |

- 新規のブレークポイントを増やさず、上記 4 値から選ぶ
- タッチターゲットは最小 44×44px を目安とする（小型ボタンは padding で確保）

## 10. Iteration Guide

本規定の変え方:

1. **規定にないケースに遭遇したら、本書に追記してから実装する**（実装が先行して規定が事後追認になる状態を作らない）
2. トークンを追加・変更するときは次をセットで揃える:
   - `src/app/globals.css`（`:root` と `[data-theme="dark"]` の両方）
   - 本書「2. Colors」等の該当表
   - コントラスト基準の検証（基準は「2. Colors」参照）
   - **`--background` を変えた場合はテーマカラー同期 3 点セット**:
     `src/app/layout.tsx` の `viewport.themeColor`（light / dark）と
     `src/app/manifest.ts` の `background_color` / `theme_color`（ライト値)
3. コンポーネントの規定を変えるときは「7. Components」を更新し、既存実装との乖離が生じる場合は
   対応 Issue を立てて追従させる

## 11. Known Gaps（未整備事項）

- **ロゴ / PWA アイコンは旧配色のまま**（`public/icons/`。再デザインはフォローアップ候補）
- **アニメーション / モーション規定なし**（現状は 0.15–0.3s の ease のみが慣習として存在）
- 非推奨エイリアス `--primary` / `--border-light` / `--border-dashed` が残存
  （参照は全ページで解消済み: `src/components/`（Phase 2 = Issue #79）・トップ / `/convert`
  （Phase 3 = Issue #80）・`/crop` + `/metadata`（Phase 4 = Issue #81）・`/edit`（Phase 5 = Issue #82）。
  `globals.css` からのエイリアス定義 3 行の削除は全フェーズのマージ後のフォローアップで行う）
- module.css のハードコード色・インラインスタイルの解消は `src/components/`
  （Phase 2 = Issue #79。`globals.css` のユーティリティクラスは全廃済み）・トップ / `/convert`
  （Phase 3 = Issue #80）・`/crop` + `/metadata` の **module.css**（Phase 4 = Issue #81）・
  `/edit`（Phase 5 = Issue #82）まで**全ページ完了**（画像上オーバーレイ UI・データ可視化色の
  固定色は例外規定に従いコメント付きで維持）
- `/metadata` の `page.tsx` に静的なインラインスタイルが残存（7 ブロック。Phase 4 の対象は
  CSS のみだったため未解消。module.css への移行はフォローアップ対象）
- Navigation の「現在ページ = `--foreground`」表示は未実装（現在ページ判定にロジック追加が
  必要なため Phase 2 = Issue #79 では見送り。全リンク `--muted-foreground` + hover `--foreground`）
- 空状態（empty state）・スケルトン / ローディングの統一規定なし
- アイコンの線幅・サイズ体系の規定なし（現状 SVG が箇所ごとに定義されている）
