/**
 * WebGL2 でライト/カラー調整を適用するためのシェーダ文字列生成（Canvas/WebGL API 非依存の純粋ロジック）。
 *
 * フラグメントシェーダは `adjustments.ts` の `applyAdjustmentToPixel` と**同じ順序・同じ係数・同じ
 * クランプ位置**を GLSL で実装する（GPU / CPU の WYSIWYG 一致の担保）。uniform 名は
 * `ADJUSTMENT_UNIFORMS` を単一の真実とし、`webglImageRenderer.ts` のアップロードと本モジュールの
 * シェーダ生成、単体テストの配線ガードがすべて同じ対応表を参照する。
 */

import { ADJUSTMENT_KEYS, type AdjustmentKey } from "./adjustments";

/** 各調整キー → GLSL の uniform 名（例: exposure → u_exposure） */
export const ADJUSTMENT_UNIFORMS: Record<AdjustmentKey, string> =
  Object.fromEntries(ADJUSTMENT_KEYS.map((key) => [key, `u_${key}`])) as Record<
    AdjustmentKey,
    string
  >;

/** テクスチャ座標を受け取るサンプラー uniform 名 */
export const IMAGE_UNIFORM = "u_image";

/** LUT の 3D テクスチャサンプラー uniform 名 */
export const LUT_SAMPLER = "u_lut";

/**
 * LUT 適用の uniform 名（配線の単一の真実）。
 * `webglImageRenderer.ts` のアップロードと本モジュールのシェーダ生成、単体テストの配線ガードが共有する。
 */
export const LUT_UNIFORMS = {
  /** 3D グリッドサイズ（float） */
  size: "u_lutSize",
  /** 適用強度 [0,1]（元色と LUT 適用色のブレンド比） */
  strength: "u_lutStrength",
  /** LUT を適用するか（0 / 1）。0 のときはサンプリングをスキップする */
  enabled: "u_lutEnabled",
  /** 入力ドメインの下限（vec3） */
  domainMin: "u_lutDomainMin",
  /** 入力ドメインの上限（vec3） */
  domainMax: "u_lutDomainMax",
} as const;

/**
 * フルスクリーン三角形を描くための頂点シェーダ。
 * gl_VertexID から座標を生成するため頂点バッファ不要（0,1,2 の 3 頂点で画面全体を覆う）。
 */
export const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;
out vec2 v_texCoord;
void main() {
  // 画面全体を覆う 1 枚の三角形（クリップ空間 -1..3）
  vec2 pos = vec2(
    float((gl_VertexID << 1) & 2),
    float(gl_VertexID & 2)
  );
  v_texCoord = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * ライト/カラー調整を適用するフラグメントシェーダ文字列を生成する。
 * uniform 宣言は `ADJUSTMENT_UNIFORMS` から組み立て、項目追加時の配線漏れを防ぐ。
 */
export const buildAdjustmentShader = (): string => {
  const uniformDeclarations = ADJUSTMENT_KEYS.map(
    (key) => `uniform float ${ADJUSTMENT_UNIFORMS[key]};`,
  ).join("\n");

  const u = ADJUSTMENT_UNIFORMS;

  return `#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D ${IMAGE_UNIFORM};
${uniformDeclarations}

// LUT（色変換フィルタ）— 調整の後段に適用
uniform sampler3D ${LUT_SAMPLER};
uniform float ${LUT_UNIFORMS.size};
uniform float ${LUT_UNIFORMS.strength};
uniform float ${LUT_UNIFORMS.enabled};
uniform vec3 ${LUT_UNIFORMS.domainMin};
uniform vec3 ${LUT_UNIFORMS.domainMax};

// Rec.709 輝度重み（adjustments.ts の LUMA_WEIGHTS と一致）
const vec3 W = vec3(0.2126, 0.7152, 0.0722);

// 分岐なし RGB<->HSV（Sam Hocevar 方式）
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 texel = texture(${IMAGE_UNIFORM}, v_texCoord);
  vec3 c = texel.rgb;

  // 1. 露光量（±1 stop）
  c *= exp2(${u.exposure});
  // 2. 輝度（加算リフト）
  c += ${u.brightness} * 0.5;
  // 3. コントラスト（0.5 ピボット）
  c = (c - 0.5) * (1.0 + ${u.contrast}) + 0.5;

  // トーンマスク用 luma（コントラスト直後に一度だけ計算し 4 項目で共用）
  float toneLuma = dot(c, W);
  float blacksAmt = ${u.blacks} * 0.5 * (1.0 - smoothstep(0.0, 0.5, toneLuma));
  float whitesAmt = ${u.whites} * 0.5 * smoothstep(0.5, 1.0, toneLuma);
  float shadowsAmt = ${u.shadows} * 0.5 * (1.0 - smoothstep(0.0, 0.6, toneLuma));
  float highlightsAmt = ${u.highlights} * 0.5 * smoothstep(0.4, 1.0, toneLuma);
  c += blacksAmt + whitesAmt + shadowsAmt + highlightsAmt;

  // 6. 色温度（+ = 暖色）/ 色合い（+ = 緑寄り）
  c.r += ${u.temperature} * 0.2;
  c.b -= ${u.temperature} * 0.2;
  c.g += ${u.tint} * 0.2;

  // 色操作の前に一度クランプ
  c = clamp(c, 0.0, 1.0);

  // 7. 彩度（-1 で完全グレースケール）
  float satLuma = dot(c, W);
  c = mix(vec3(satLuma), c, 1.0 + ${u.saturation});

  // 8. 自然な彩度（高彩度画素ほど効果を抑制）
  float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
  float amt = ${u.vibrance} * (1.0 - sat);
  float vibLuma = dot(c, W);
  c = mix(vec3(vibLuma), c, 1.0 + amt);
  c = clamp(c, 0.0, 1.0);

  // 9. 色相（±180° の回転）
  if (${u.hue} != 0.0) {
    vec3 hsv = rgb2hsv(c);
    hsv.x = fract(hsv.x + ${u.hue} * 0.5);
    c = hsv2rgb(hsv);
  }

  // 10. 調整のクランプ（LUT 入力を [0,1] の妥当な色にそろえる）
  c = clamp(c, 0.0, 1.0);

  // 11. LUT 色変換フィルタ（applyLutToPixel と同順: ドメイン正規化 → トライリニア lookup → 強度ブレンド）。
  //     3D テクスチャの LINEAR サンプリングがトライリニア補間を担い、テクセル中心補正
  //     (v*(N-1)+0.5)/N で節点ベースの補間に一致させる。
  if (${LUT_UNIFORMS.enabled} > 0.5) {
    vec3 lutN = clamp(
      (c - ${LUT_UNIFORMS.domainMin}) / (${LUT_UNIFORMS.domainMax} - ${LUT_UNIFORMS.domainMin}),
      0.0,
      1.0
    );
    vec3 lutCoord = (lutN * (${LUT_UNIFORMS.size} - 1.0) + 0.5) / ${LUT_UNIFORMS.size};
    vec3 graded = texture(${LUT_SAMPLER}, lutCoord).rgb;
    c = mix(c, graded, ${LUT_UNIFORMS.strength});
  }

  // 12. 最終クランプ
  fragColor = vec4(clamp(c, 0.0, 1.0), texel.a);
}
`;
};
