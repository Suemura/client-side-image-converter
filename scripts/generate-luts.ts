// 同梱プリセット LUT（public/luts/*.cube）を決定論的なアルゴリズムで生成する一度きりのスクリプト。
//
// 生成物は完全にアルゴリズム由来のオリジナルで、第三者の LUT を再配布しない（CC0 として同梱する。
// public/luts/CREDITS.md に明記）。ビルドには組み込まず、生成した .cube をコミットして配信する
// （scripts/generate-icons.mjs と同方針）。
//
// 使い方: node scripts/generate-luts.ts
// Node 24 の TypeScript 型ストリップ実行で動くため tsx 等の追加依存は不要。

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public/luts");

/** 生成する 3D LUT のグリッドサイズ（写真用途で標準的な 17。滑らかな階調に十分） */
const SIZE = 17;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, t: number): number => a * (1 - t) + b * t;
const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
/** Rec.709 luma */
const luma = (r: number, g: number, b: number): number =>
  r * 0.2126 + g * 0.7152 + b * 0.0722;

type Rgb = [number, number, number];
type Transform = (r: number, g: number, b: number) => Rgb;

/** シネマ風（ティール&オレンジ）: シャドウを青緑、ハイライトを橙へ寄せコントラストを軽く上げる */
const cinematic: Transform = (r, g, b) => {
  const l = luma(r, g, b);
  // 0.5 ピボットの弱いコントラスト
  const contrast = 1.12;
  let cr = (r - 0.5) * contrast + 0.5;
  let cg = (g - 0.5) * contrast + 0.5;
  let cb = (b - 0.5) * contrast + 0.5;
  // シャドウ寄り（1-l）でティール、ハイライト寄り(l)でオレンジ
  const shadow = 1 - smoothstep(0.0, 0.5, l);
  const highlight = smoothstep(0.5, 1.0, l);
  cr += highlight * 0.06 - shadow * 0.04;
  cg += shadow * 0.02 + highlight * 0.02;
  cb += shadow * 0.06 - highlight * 0.05;
  return [clamp01(cr), clamp01(cg), clamp01(cb)];
};

/** 暖色: 色温度を上げた見え方（R を持ち上げ B を下げる） + わずかな彩度上げ */
const warm: Transform = (r, g, b) => {
  let cr = r + 0.06 * (1 - r);
  let cg = g + 0.02 * (1 - g);
  let cb = b - 0.06 * b;
  const l = luma(cr, cg, cb);
  const sat = 1.08;
  cr = mix(l, cr, sat);
  cg = mix(l, cg, sat);
  cb = mix(l, cb, sat);
  return [clamp01(cr), clamp01(cg), clamp01(cb)];
};

/** 寒色: 色温度を下げた見え方（B を持ち上げ R を下げる） */
const cool: Transform = (r, g, b) => {
  let cr = r - 0.06 * r;
  const cg = g + 0.01 * (1 - g);
  let cb = b + 0.07 * (1 - b);
  const l = luma(cr, cg, cb);
  const sat = 1.05;
  cr = mix(l, cr, sat);
  cb = mix(l, cb, sat);
  return [clamp01(cr), clamp01(cg), clamp01(cb)];
};

/** モノクロ: Rec.709 luma でグレースケール化し、ごく僅かに冷たい黒に寄せる */
const mono: Transform = (r, g, b) => {
  const l = luma(r, g, b);
  // 弱い S 字トーンで締める
  const t = smoothstep(0.0, 1.0, l);
  const v = mix(l, t, 0.25);
  return [clamp01(v), clamp01(v), clamp01(v * 1.01)];
};

/** ヴィンテージ: 黒を持ち上げてフェード + セピア寄りの色被り + 彩度を落とす */
const vintage: Transform = (r, g, b) => {
  const l = luma(r, g, b);
  const desat = 0.82;
  let cr = mix(l, r, desat);
  let cg = mix(l, g, desat);
  let cb = mix(l, b, desat);
  // 黒の持ち上げ（フェード）
  const lift = 0.06;
  cr = cr + lift * (1 - cr);
  cg = cg + lift * 0.8 * (1 - cg);
  cb = cb + lift * 0.5 * (1 - cb);
  // セピア色被り
  cr += 0.04;
  cb -= 0.03;
  return [clamp01(cr), clamp01(cg), clamp01(cb)];
};

interface PresetDef {
  file: string;
  title: string;
  transform: Transform;
}

const PRESETS: PresetDef[] = [
  { file: "cinematic.cube", title: "Cinematic", transform: cinematic },
  { file: "warm.cube", title: "Warm", transform: warm },
  { file: "cool.cube", title: "Cool", transform: cool },
  { file: "mono.cube", title: "Mono", transform: mono },
  { file: "vintage.cube", title: "Vintage", transform: vintage },
];

/** 数値を .cube 用に整形（末尾の余分な 0 を落とす） */
const fmt = (v: number): string => {
  const s = clamp01(v).toFixed(6);
  return s.replace(/\.?0+$/, "") || "0";
};

const buildCube = (def: PresetDef): string => {
  const lines: string[] = [
    `TITLE "${def.title}"`,
    `LUT_3D_SIZE ${SIZE}`,
    "DOMAIN_MIN 0.0 0.0 0.0",
    "DOMAIN_MAX 1.0 1.0 1.0",
  ];
  // R 最速の走査順（.cube 3D データの標準順）
  for (let b = 0; b < SIZE; b++) {
    for (let g = 0; g < SIZE; g++) {
      for (let r = 0; r < SIZE; r++) {
        const [or, og, ob] = def.transform(
          r / (SIZE - 1),
          g / (SIZE - 1),
          b / (SIZE - 1),
        );
        lines.push(`${fmt(or)} ${fmt(og)} ${fmt(ob)}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
};

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  for (const def of PRESETS) {
    const cube = buildCube(def);
    await writeFile(path.join(outDir, def.file), cube, "utf8");
    console.log(`[generate-luts] wrote public/luts/${def.file}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
