import { describe, expect, it } from "vitest";
import {
  ADJUSTMENT_UNIFORMS,
  buildAdjustmentShader,
  CURVE_SAMPLER,
  CURVE_UNIFORMS,
  EFFECT_UNIFORMS,
  IMAGE_UNIFORM,
  LUT_SAMPLER,
  LUT_UNIFORMS,
  VERTEX_SHADER_SOURCE,
} from "../adjustmentShader";
import { ADJUSTMENT_KEYS } from "../adjustments";
import { GAUSS3_TAPS, LOWBIAS32_M1, LOWBIAS32_M2 } from "../effects";

describe("ADJUSTMENT_UNIFORMS", () => {
  it("全調整キーに uniform 名を対応させる", () => {
    for (const key of ADJUSTMENT_KEYS) {
      expect(ADJUSTMENT_UNIFORMS[key]).toBe(`u_${key}`);
    }
    expect(Object.keys(ADJUSTMENT_UNIFORMS).sort()).toEqual(
      [...ADJUSTMENT_KEYS].sort(),
    );
  });
});

describe("VERTEX_SHADER_SOURCE", () => {
  it("GLSL ES 3.00 で v_texCoord を出力する", () => {
    expect(VERTEX_SHADER_SOURCE).toContain("#version 300 es");
    expect(VERTEX_SHADER_SOURCE).toContain("out vec2 v_texCoord");
    expect(VERTEX_SHADER_SOURCE).toContain("gl_Position");
  });
});

describe("buildAdjustmentShader", () => {
  const shader = buildAdjustmentShader();

  it("GLSL ES 3.00 フラグメントシェーダの必須要素を含む", () => {
    expect(shader).toContain("#version 300 es");
    expect(shader).toContain("precision");
    expect(shader).toContain("out vec4 fragColor");
    expect(shader).toContain("void main()");
    expect(shader).toContain(`uniform sampler2D ${IMAGE_UNIFORM}`);
  });

  it("全調整キーの uniform が宣言され本文で参照されている（配線漏れガード）", () => {
    for (const key of ADJUSTMENT_KEYS) {
      const uniformName = ADJUSTMENT_UNIFORMS[key];
      // 宣言
      expect(shader).toContain(`uniform float ${uniformName};`);
      // 宣言以外での使用（本文での参照が最低 1 回ある）
      const occurrences = shader.split(uniformName).length - 1;
      expect(occurrences).toBeGreaterThanOrEqual(2);
    }
  });

  it("HSV 変換と最終クランプを含む", () => {
    expect(shader).toContain("rgb2hsv");
    expect(shader).toContain("hsv2rgb");
    expect(shader).toContain("clamp(c, 0.0, 1.0)");
  });

  it("LUT の sampler3D と uniform が宣言・参照されている（配線漏れガード）", () => {
    // sampler3D は precision 宣言が必要
    expect(shader).toContain("precision highp sampler3D;");
    expect(shader).toContain(`uniform sampler3D ${LUT_SAMPLER};`);
    // LUT_UNIFORMS の各 uniform が宣言され本文でも参照されている
    for (const uniformName of Object.values(LUT_UNIFORMS)) {
      const declared =
        shader.includes(`uniform float ${uniformName};`) ||
        shader.includes(`uniform vec3 ${uniformName};`);
      expect(declared).toBe(true);
      const occurrences = shader.split(uniformName).length - 1;
      expect(occurrences).toBeGreaterThanOrEqual(2);
    }
  });

  it("LUT を強度ブレンドで適用する（enabled ガード + トライリニア lookup）", () => {
    expect(shader).toContain(`if (${LUT_UNIFORMS.enabled} > 0.5)`);
    expect(shader).toContain(`texture(${LUT_SAMPLER}, lutCoord)`);
    expect(shader).toContain(`mix(c, graded, ${LUT_UNIFORMS.strength})`);
  });

  it("トーンカーブの sampler2D と uniform が宣言・参照されている（配線漏れガード）", () => {
    expect(shader).toContain(`uniform sampler2D ${CURVE_SAMPLER};`);
    for (const uniformName of Object.values(CURVE_UNIFORMS)) {
      expect(shader).toContain(`uniform float ${uniformName};`);
      const occurrences = shader.split(uniformName).length - 1;
      expect(occurrences).toBeGreaterThanOrEqual(2);
    }
  });

  it("トーンカーブは enabled ガード付きで RGB → 輝度（.a の加算シフト）の順に適用する", () => {
    expect(shader).toContain(`if (${CURVE_UNIFORMS.enabled} > 0.5)`);
    // 各チャンネルの lookup（.r / .g / .b）と輝度カーブ（.a）の加算シフト
    expect(shader).toContain(
      `texture(${CURVE_SAMPLER}, vec2(curvePos.r, 0.5)).r`,
    );
    expect(shader).toContain(
      `texture(${CURVE_SAMPLER}, vec2(curvePos.g, 0.5)).g`,
    );
    expect(shader).toContain(
      `texture(${CURVE_SAMPLER}, vec2(curvePos.b, 0.5)).b`,
    );
    expect(shader).toContain(").a - curveLuma");
    expect(shader).toContain("clamp(c + curveShift, 0.0, 1.0)");
  });

  it("適用順は 調整 → トーンカーブ → LUT（カーブブロックが LUT ブロックより前にある）", () => {
    const curveIndex = shader.indexOf(`if (${CURVE_UNIFORMS.enabled} > 0.5)`);
    const lutIndex = shader.indexOf(`if (${LUT_UNIFORMS.enabled} > 0.5)`);
    expect(curveIndex).toBeGreaterThan(-1);
    expect(lutIndex).toBeGreaterThan(-1);
    expect(curveIndex).toBeLessThan(lutIndex);
  });

  it("ディテールの uniform（clarityStride）が宣言・参照され texelFetch でタップする（配線漏れガード）", () => {
    expect(shader).toContain(`uniform int ${EFFECT_UNIFORMS.clarityStride};`);
    const occurrences = shader.split(EFFECT_UNIFORMS.clarityStride).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
    // フィルタ非経由の厳密テクセル読み（CPU の整数座標タップとの一致の根拠）
    expect(shader).toContain(`texelFetch(${IMAGE_UNIFORM},`);
    expect(shader).toContain(`textureSize(${IMAGE_UNIFORM}, 0)`);
    // タップ数はカーネル定義と一致（near / wide の 2 系統）
    const tapCount = shader.split("texelFetch").length - 1;
    expect(tapCount).toBe(GAUSS3_TAPS.length * 2);
  });

  it("グレインのハッシュ乗数が effects.ts の lowbias32 とビット同一（GPU/CPU の粒一致ガード）", () => {
    expect(shader).toContain(`x *= ${LOWBIAS32_M1}u;`);
    expect(shader).toContain(`x *= ${LOWBIAS32_M2}u;`);
    expect(shader).toContain("float(hashed >> 8u) * (1.0 / 16777216.0)");
  });

  it("ガンマは露光の後・輝度の前、モノクロは色相の後にある（CPU パイプラインと同位置）", () => {
    const exposureIndex = shader.indexOf(
      `exp2(${ADJUSTMENT_UNIFORMS.exposure})`,
    );
    const gammaIndex = shader.indexOf(`exp2(-${ADJUSTMENT_UNIFORMS.gamma})`);
    const brightnessIndex = shader.indexOf(
      `${ADJUSTMENT_UNIFORMS.brightness} * 0.5`,
    );
    const hueIndex = shader.indexOf(`fract(hsv.x + ${ADJUSTMENT_UNIFORMS.hue}`);
    const monoIndex = shader.indexOf(
      `if (${ADJUSTMENT_UNIFORMS.monochrome} >= 0.5)`,
    );
    expect(exposureIndex).toBeGreaterThan(-1);
    expect(gammaIndex).toBeGreaterThan(exposureIndex);
    expect(brightnessIndex).toBeGreaterThan(gammaIndex);
    expect(monoIndex).toBeGreaterThan(hueIndex);
  });

  it("適用順は ディテール → 調整、LUT → ビネット → グレイン → 最終クランプ", () => {
    const detailIndex = shader.indexOf("texelFetch");
    const exposureIndex = shader.indexOf(
      `exp2(${ADJUSTMENT_UNIFORMS.exposure})`,
    );
    const lutIndex = shader.indexOf(`if (${LUT_UNIFORMS.enabled} > 0.5)`);
    const vignetteIndex = shader.indexOf(
      `if (${ADJUSTMENT_UNIFORMS.vignette} != 0.0) {`,
    );
    const grainIndex = shader.indexOf(
      `if (${ADJUSTMENT_UNIFORMS.grain} > 0.0) {`,
    );
    const finalClampIndex = shader.lastIndexOf("fragColor = vec4(clamp(");
    expect(detailIndex).toBeGreaterThan(-1);
    expect(detailIndex).toBeLessThan(exposureIndex);
    expect(lutIndex).toBeLessThan(vignetteIndex);
    expect(vignetteIndex).toBeLessThan(grainIndex);
    expect(grainIndex).toBeLessThan(finalClampIndex);
  });
});
