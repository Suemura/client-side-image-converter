// TypeScript 6.0 以降、副作用インポート（import "./globals.css" など）も
// モジュール解決の対象となるため（TS2882）、グローバル CSS 用の宣言を定義する。
// CSS Modules（*.module.css）の型は next の global.d.ts が提供する。
declare module "*.css";
