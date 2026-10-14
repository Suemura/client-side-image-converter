/**
 * WebGL2 でライト/カラー調整を適用するためのシェーダ文字列生成（Canvas/WebGL API 非依存の純粋ロジック）。
 *
 * フラグメントシェーダは `adjustments.ts` の `applyAdjustmentToPixel` と**同じ順序・同じ係数・同じ
 * クランプ位置**を GLSL で実装する（GPU / CPU の WYSIWYG 一致の担保）。uniform 名は
 * `ADJUSTMENT_UNIFORMS` を単一の真実とし、`webglImageRenderer.ts` のアップロードと本モジュールの
 * シェーダ生成、単体テストの配線ガードがすべて同じ対応表を参照する。
 */

import { ADJUSTMENT_KEYS, type AdjustmentKey } from "./adjustments";
import {
  CLARITY_GAIN,
  GAUSS3_TAPS,
  GRAIN_STRENGTH,
  LOWBIAS32_M1,
  LOWBIAS32_M2,
  SHARPNESS_GAIN,
  VIGNETTE_INNER,
  VIGNETTE_STRENGTH,
} from "./effects";
import { CURVE_LUT_SIZE } from "./toneCurve";

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

/** トーンカーブの 256×1 テクスチャサンプラー uniform 名（.rgb=各チャンネル / .a=輝度） */
export const CURVE_SAMPLER = "u_curve";

/**
 * トーンカーブ適用の uniform 名（配線の単一の真実）。
 * `webglImageRenderer.ts` のアップロードと本モジュールのシェーダ生成、単体テストの配線ガードが共有する。
 */
export const CURVE_UNIFORMS = {
  /** トーンカーブを適用するか（0 / 1）。0 のときはサンプリングをスキップする */
  enabled: "u_curveEnabled",
} as const;

/**
 * ディテール / 効果の uniform 名（配線の単一の真実）。
 * 調整キー由来の uniform（ADJUSTMENT_UNIFORMS）以外に必要な補助 uniform を置く。
 * `webglImageRenderer.ts` のアップロードと本モジュールのシェーダ生成、単体テストの配線ガードが共有する。
 */
export const EFFECT_UNIFORMS = {
  /** 明瞭度の大半径ぼかしの整数ストライド（effects.ts の clarityStride(width, height) をアップロード） */
  clarityStride: "u_clarityStride",
} as const;

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

/** 数値を GLSL の float リテラルへ整形する（整数値は 2 → "2.0" のように小数点を付ける） */
const glslFloat = (value: number): string =>
  Number.isInteger(value) ? `${value}.0` : `${value}`;

/**
 * ライト/カラー調整を適用するフラグメントシェーダ文字列を生成する。
 * uniform 宣言は `ADJUSTMENT_UNIFORMS` から組み立て、項目追加時の配線漏れを防ぐ。
 * ディテールのガウスタップは `GAUSS3_TAPS`、係数は `effects.ts` の定数から埋め込み、
 * カーネル・係数・ハッシュ乗数の単一の真実を CPU パスと共有する。
 *
 * 契約: 本シェーダは **描画サイズ == ソーステクスチャサイズ（1:1）** を前提とする。
 * ディテールの近傍タップ（`gl_FragCoord` 由来の `texelFetch`）・ビネットの正規化距離
 * （`textureSize` 基準）・グレインのハッシュ座標がいずれもレンダ座標 = ソース画素座標の
 * 一致に依存するため、縮小 / 拡大描画すると CPU パスと結果が乖離する
 * （`webglImageRenderer.ts` の `render()` の契約を参照）。
 */
export const buildAdjustmentShader = (): string => {
  const uniformDeclarations = ADJUSTMENT_KEYS.map(
    (key) => `uniform float ${ADJUSTMENT_UNIFORMS[key]};`,
  ).join("\n");

  const u = ADJUSTMENT_UNIFORMS;

  // ディテール（輝度 unsharp mask）のタップ行を GAUSS3_TAPS から生成する。
  // texelFetch はフィルタを経由しない厳密なテクセル読みのため CPU の整数座標タップと一致する。
  // near（シャープネス）と wide（明瞭度）は uniform 分岐（dynamically uniform で分岐コストは実質なし）で
  // 独立にガードし、片方のみ有効な典型ケースでテクスチャ読みを半減する
  // （CPU の detailDeltaAt が項目ごとに blurLumaAt をスキップする構造と同じ。
  //   deltaS / deltaC はそれぞれ無効時に係数 0 で消えるため未計算側の blur 値は結果に影響しない）
  const nearTapLines = GAUSS3_TAPS.map(
    (tap) =>
      `      blurNear += ${glslFloat(tap.w)} * dot(texelFetch(${IMAGE_UNIFORM}, clamp(baseTexel + ivec2(${tap.dx}, ${tap.dy}), ivec2(0), sizePx - 1), 0).rgb, W);`,
  ).join("\n");
  const wideTapLines = GAUSS3_TAPS.map(
    (tap) =>
      `      blurWide += ${glslFloat(tap.w)} * dot(texelFetch(${IMAGE_UNIFORM}, clamp(baseTexel + ivec2(${tap.dx}, ${tap.dy}) * ${EFFECT_UNIFORMS.clarityStride}, ivec2(0), sizePx - 1), 0).rgb, W);`,
  ).join("\n");

  return `#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D ${IMAGE_UNIFORM};
${uniformDeclarations}

// 明瞭度の大半径ぼかしの整数ストライド（effects.ts の clarityStride と同じ値をアップロード）
uniform int ${EFFECT_UNIFORMS.clarityStride};

// トーンカーブ（256×1。.rgb=各チャンネルカーブ / .a=輝度カーブ）— 調整の後・LUT の前に適用
uniform sampler2D ${CURVE_SAMPLER};
uniform float ${CURVE_UNIFORMS.enabled};

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

// lowbias32 整数ハッシュ（effects.ts の lowbias32 と乗算定数までビット同一。グレインの粒の一致の根拠）
uint lowbias32(uint x) {
  x ^= x >> 16u;
  x *= ${LOWBIAS32_M1}u;
  x ^= x >> 15u;
  x *= ${LOWBIAS32_M2}u;
  x ^= x >> 16u;
  return x;
}

void main() {
  vec4 texel = texture(${IMAGE_UNIFORM}, v_texCoord);
  vec3 c = texel.rgb;

  // 0. ディテール（シャープネス / 明瞭度）: ソース輝度の unsharp mask（effects.ts の detailDeltaAt をミラー）。
  //    調整の前段（ソース直後）に置くことで近傍参照がソーステクスチャだけで完結し、
  //    マルチパス / 中間 FBO なしの単一シェーダで実装できる。
  //    テクスチャは Y 反転済みだがカーネルが y 対称なためぼかし値は CPU（画像座標）と一致する
  if (${u.sharpness} > 0.0 || ${u.clarity} != 0.0) {
    ivec2 sizePx = textureSize(${IMAGE_UNIFORM}, 0);
    ivec2 baseTexel = ivec2(gl_FragCoord.xy);
    float baseLuma = dot(c, W);
    float blurNear = 0.0;
    float blurWide = 0.0;
    if (${u.sharpness} > 0.0) {
${nearTapLines}
    }
    if (${u.clarity} != 0.0) {
${wideTapLines}
    }
    float deltaS = max(${u.sharpness}, 0.0) * ${glslFloat(SHARPNESS_GAIN)} * (baseLuma - blurNear);
    float midtone = clamp(1.0 - abs(2.0 * baseLuma - 1.0), 0.0, 1.0);
    float deltaC = ${u.clarity} * ${glslFloat(CLARITY_GAIN)} * midtone * (baseLuma - blurWide);
    c = clamp(c + deltaS + deltaC, 0.0, 1.0);
  }

  // 1. 露光量（±1 stop）
  c *= exp2(${u.exposure});
  // 1b. ガンマ（γ = 2^(-n) で + が明るく。露光直後は c ≥ 0 のため pow が安全）
  if (${u.gamma} != 0.0) {
    c = pow(max(c, vec3(0.0)), vec3(exp2(-${u.gamma})));
  }
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

  // 9b. モノクロ変換（0/1 トグル。色相の後 = 調整の最後で luma 化。applyAdjustmentToPixel と同位置）
  if (${u.monochrome} >= 0.5) {
    c = vec3(dot(c, W));
  }

  // 10. 調整のクランプ（トーンカーブ / LUT の入力を [0,1] の妥当な色にそろえる）
  c = clamp(c, 0.0, 1.0);

  // 11. トーンカーブ（applyToneCurveToPixel と同順: RGB マスターカーブ → 輝度カーブの加算シフト）。
  //     256×1 テクスチャの LINEAR サンプリング + テクセル中心補正 (v*255+0.5)/256 で
  //     CPU の floor+lerp 補間（sampleCurveTable）に一致させる。
  if (${CURVE_UNIFORMS.enabled} > 0.5) {
    vec3 curvePos = (c * ${CURVE_LUT_SIZE - 1}.0 + 0.5) / ${CURVE_LUT_SIZE}.0;
    c = vec3(
      texture(${CURVE_SAMPLER}, vec2(curvePos.r, 0.5)).r,
      texture(${CURVE_SAMPLER}, vec2(curvePos.g, 0.5)).g,
      texture(${CURVE_SAMPLER}, vec2(curvePos.b, 0.5)).b
    );
    float curveLuma = dot(c, W);
    float curveShift = texture(
      ${CURVE_SAMPLER},
      vec2((curveLuma * ${CURVE_LUT_SIZE - 1}.0 + 0.5) / ${CURVE_LUT_SIZE}.0, 0.5)
    ).a - curveLuma;
    c = clamp(c + curveShift, 0.0, 1.0);
  }

  // 12. LUT 色変換フィルタ（applyLutToPixel と同順: ドメイン正規化 → トライリニア lookup → 強度ブレンド）。
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

  // 13. ビネット / グレイン（画素位置依存の仕上げ効果。LUT の後段 = パイプラインの最後）。
  //     テクスチャ / ドローバッファは Y 反転しているため gl_FragCoord から画像座標へ変換して
  //     CPU（vignetteFactorAt / grainNoiseAt の画像座標）と揃える
  if (${u.vignette} != 0.0 || ${u.grain} > 0.0) {
    ivec2 fxSize = textureSize(${IMAGE_UNIFORM}, 0);
    int imgX = int(gl_FragCoord.x);
    int imgY = fxSize.y - 1 - int(gl_FragCoord.y);
    // ビネット（画素中心の対角正規化距離による周辺減光 / 増光。vignetteFactorAt をミラー）
    if (${u.vignette} != 0.0) {
      vec2 pos = vec2(
        (float(imgX) + 0.5) / float(fxSize.x),
        (float(imgY) + 0.5) / float(fxSize.y)
      ) * 2.0 - 1.0;
      float dist = length(pos) / ${Math.SQRT2};
      float fall = smoothstep(${glslFloat(VIGNETTE_INNER)}, 1.0, dist);
      c *= max(1.0 - ${u.vignette} * ${glslFloat(VIGNETTE_STRENGTH)} * fall, 0.0);
    }
    // グレイン（決定的な整数ハッシュノイズ。grainNoiseAt をミラー。上位 24bit のみ float 化）
    if (${u.grain} > 0.0) {
      uint hashed = lowbias32(uint(imgX) + lowbias32(uint(imgY)));
      float noise = float(hashed >> 8u) * (1.0 / 16777216.0) * 2.0 - 1.0;
      c += noise * ${u.grain} * ${glslFloat(GRAIN_STRENGTH)};
    }
  }

  // 14. 最終クランプ
  fragColor = vec4(clamp(c, 0.0, 1.0), texel.a);
}
`;
};
