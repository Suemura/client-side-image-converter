import { describe, expect, it } from "vitest";
import {
  ADJUSTMENT_UNIFORMS,
  buildAdjustmentShader,
  IMAGE_UNIFORM,
  LUT_SAMPLER,
  LUT_UNIFORMS,
  VERTEX_SHADER_SOURCE,
} from "../adjustmentShader";
import { ADJUSTMENT_KEYS } from "../adjustments";

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
});
