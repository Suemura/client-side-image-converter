/**
 * ライト/カラー調整を画像へ適用する描画オーケストレーション。
 *
 * WebGL2 フラグメントシェーダ（`adjustmentShader.ts`）でリアルタイムに調整を適用し、
 * WebGL2 非対応環境では Canvas2D + `applyAdjustmentToPixel`（`adjustments.ts`）の CPU パスへ
 * フォールバックする。両パスは同一の数式（`adjustments.ts` を単一の真実とする）を用いるため
 * 出力は一致する（WYSIWYG）。
 *
 * Canvas / WebGL / DOM に依存するため単体テストの対象外（happy-dom は WebGL / getImageData 非対応）。
 * 実ブラウザ動作は E2E（`e2e/edit.spec.ts`）で検証する。純粋な数式部分は `adjustments.ts` に切り出し済み。
 */

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
} from "./adjustmentShader";
import {
  applyAdjustmentToPixel,
  clamp01,
  type NormalizedAdjustments,
} from "./adjustments";
import {
  clarityStride,
  computeLumaPlane,
  detailDeltaAt,
  GRAIN_STRENGTH,
  grainNoiseAt,
  vignetteFactorAt,
} from "./effects";
import { applyLutToPixel, createIdentityLut, type LutData } from "./lutParser";
import {
  applyToneCurveToPixel,
  buildToneCurveTable,
  CURVE_LUT_SIZE,
  DEFAULT_TONE_CURVE,
} from "./toneCurve";

/** テクスチャ / drawImage の双方に渡せる描画ソース */
export type EditableSource = HTMLCanvasElement | HTMLImageElement | ImageBitmap;

/** LUT フィルタの適用指定（データ本体 + 強度） */
export interface LutApplication {
  /** 正規化済み 3D LUT データ */
  data: LutData;
  /** 適用強度 [0,1]（元色と LUT 適用色のブレンド比） */
  strength: number;
}

/** 調整を適用して自身の canvas へ描画する永続レンダラ */
export interface AdjustmentRenderer {
  /**
   * ソースを width×height の canvas へ調整（+ 任意でトーンカーブ / LUT）適用して描画する。
   * curve は `buildToneCurveTable` の焼成テーブル（null は恒等スキップ）。
   */
  render(
    source: EditableSource,
    width: number,
    height: number,
    normalized: NormalizedAdjustments,
    lut?: LutApplication | null,
    curve?: Float32Array | null,
  ): void;
  /** 描画先の canvas（呼び出し側はこれを drawImage で別 canvas / 画面へ転写する） */
  readonly canvas: HTMLCanvasElement;
  /** GL リソースを解放する */
  dispose(): void;
}

/** LUT の Float32 データを 3D テクスチャ用の RGB8 バイト列へ変換する */
const lutDataToRgb8 = (lut: LutData): Uint8Array => {
  const bytes = new Uint8Array(lut.size ** 3 * 3);
  for (let i = 0; i < bytes.length; i++) {
    const v = lut.data[i];
    bytes[i] = Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 255);
  }
  return bytes;
};

/** トーンカーブの焼成テーブル（Float32 RGBA）を 256×1 テクスチャ用の RGBA8 バイト列へ変換する */
const curveTableToRgba8 = (table: Float32Array): Uint8Array => {
  const bytes = new Uint8Array(table.length);
  for (let i = 0; i < bytes.length; i++) {
    const v = table[i];
    bytes[i] = Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 255);
  }
  return bytes;
};

const compileShader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Failed to create shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
};

/**
 * WebGL2 レンダラを生成する。WebGL2 が使えない / 初期化に失敗した場合は null を返す
 * （呼び出し側は null のとき CPU フォールバックへ切り替える）。
 *
 * バッチ処理では 1 個のレンダラを全ファイルで使い回し、最後に `dispose()` する
 * （画像ごとにコンテキストを作ると WebGL コンテキスト上限で枯渇するため。
 * `imageProcessingPool` の「起動→複数処理→terminate」と同方針）。
 */
export const createAdjustmentRenderer = (): AdjustmentRenderer | null => {
  if (typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", {
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    return null;
  }

  try {
    const vertexShader = compileShader(
      gl,
      gl.VERTEX_SHADER,
      VERTEX_SHADER_SOURCE,
    );
    const fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      buildAdjustmentShader(),
    );
    const program = gl.createProgram();
    if (!program) {
      throw new Error("Failed to create program");
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    // link 後は個々のシェーダは不要
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program link error: ${log}`);
    }

    // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram は WebGL API であり React フックではない（use* 命名ヒューリスティックの誤検知）
    gl.useProgram(program);

    // uniform ロケーションを一度だけ解決してキャッシュする
    const imageLocation = gl.getUniformLocation(program, IMAGE_UNIFORM);
    const uniformLocations = new Map<string, WebGLUniformLocation | null>();
    for (const uniformName of Object.values(ADJUSTMENT_UNIFORMS)) {
      uniformLocations.set(
        uniformName,
        gl.getUniformLocation(program, uniformName),
      );
    }
    // LUT の uniform ロケーション
    const lutSamplerLocation = gl.getUniformLocation(program, LUT_SAMPLER);
    const lutSizeLocation = gl.getUniformLocation(program, LUT_UNIFORMS.size);
    const lutStrengthLocation = gl.getUniformLocation(
      program,
      LUT_UNIFORMS.strength,
    );
    const lutEnabledLocation = gl.getUniformLocation(
      program,
      LUT_UNIFORMS.enabled,
    );
    const lutDomainMinLocation = gl.getUniformLocation(
      program,
      LUT_UNIFORMS.domainMin,
    );
    const lutDomainMaxLocation = gl.getUniformLocation(
      program,
      LUT_UNIFORMS.domainMax,
    );
    // トーンカーブの uniform ロケーション
    const curveSamplerLocation = gl.getUniformLocation(program, CURVE_SAMPLER);
    const curveEnabledLocation = gl.getUniformLocation(
      program,
      CURVE_UNIFORMS.enabled,
    );
    // ディテール（明瞭度ストライド）の uniform ロケーション
    const clarityStrideLocation = gl.getUniformLocation(
      program,
      EFFECT_UNIFORMS.clarityStride,
    );

    // RGB 行が 4 バイト境界に揃わない 3D LUT のアップロードに備えてアラインメントを 1 に固定する
    // （RGBA 画像テクスチャのアップロードにも安全）
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    // 頂点属性なしのフルスクリーン三角形描画には VAO のバインドが必要
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (imageLocation) {
      gl.uniform1i(imageLocation, 0);
    }

    // LUT 用の 3D テクスチャ（TEXTURE1）。既定は恒等 LUT を入れて常に complete に保つ
    // （LUT 未選択時も sampler3D のサンプリングが安全）。
    const lutTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, lutTexture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const identityLut = createIdentityLut(2);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGB8,
      identityLut.size,
      identityLut.size,
      identityLut.size,
      0,
      gl.RGB,
      gl.UNSIGNED_BYTE,
      lutDataToRgb8(identityLut),
    );
    if (lutSamplerLocation) {
      gl.uniform1i(lutSamplerLocation, 1);
    }
    // 直前にアップロードした LUT データ。参照比較で不要な再アップロードを避ける
    // （強度のみ変更時はテクスチャ転送を省く）。
    let lastLutData: LutData | null = null;

    // トーンカーブ用の 256×1 テクスチャ（TEXTURE2）。既定は恒等テーブルを入れて常に complete に保つ
    // （カーブ未編集時も sampler2D のサンプリングが安全。LUT の恒等既定と同方針）。
    const curveTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, curveTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      CURVE_LUT_SIZE,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      curveTableToRgba8(buildToneCurveTable(DEFAULT_TONE_CURVE)),
    );
    if (curveSamplerLocation) {
      gl.uniform1i(curveSamplerLocation, 2);
    }
    // 直前にアップロードしたカーブテーブル。参照比較で不要な再アップロードを避ける
    let lastCurveTable: Float32Array | null = null;

    // 直前にアップロードしたソース。同一ソースでの調整値のみ変更時（プレビューの
    // スライダー操作など）にフル解像度テクスチャの再アップロードを避けるために保持する。
    // 呼び出し側はソースの内容を変えるときは必ず別のオブジェクトを渡す前提
    // （renderOrientedImage / imageEditor は毎回新しい canvas を生成する）。
    let lastSource: EditableSource | null = null;

    const render: AdjustmentRenderer["render"] = (
      source,
      width,
      height,
      normalized,
      lut = null,
      curve = null,
    ) => {
      // canvas のサイズ代入はドローバッファをリセットするため、変化時のみ行う
      if (canvas.width !== width) {
        canvas.width = width;
      }
      if (canvas.height !== height) {
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);

      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      // ソースが変わったときだけテクスチャを再アップロードする（調整値のみ変更時は転送を省く）。
      // テクスチャは下から上へ格納されるため Y 反転して向きを合わせる。
      if (source !== lastSource) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          source,
        );
        lastSource = source;
      }

      // 調整 uniform をアップロード
      for (const [key, uniformName] of Object.entries(ADJUSTMENT_UNIFORMS)) {
        const location = uniformLocations.get(uniformName);
        if (location) {
          gl.uniform1f(
            location,
            normalized[key as keyof NormalizedAdjustments],
          );
        }
      }

      // 明瞭度の大半径ぼかしストライド（CPU パスの clarityStride と同じ解像度適応値）
      if (clarityStrideLocation) {
        gl.uniform1i(clarityStrideLocation, clarityStride(width, height));
      }

      // LUT テクスチャ（データ参照が変わったときだけ再アップロード。強度のみ変更時は転送を省く）
      if (lut && lut.data !== lastLutData) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_3D, lutTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage3D(
          gl.TEXTURE_3D,
          0,
          gl.RGB8,
          lut.data.size,
          lut.data.size,
          lut.data.size,
          0,
          gl.RGB,
          gl.UNSIGNED_BYTE,
          lutDataToRgb8(lut.data),
        );
        lastLutData = lut.data;
      }

      // トーンカーブテクスチャ（テーブル参照が変わったときだけ再アップロード）
      if (curve && curve !== lastCurveTable) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, curveTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          CURVE_LUT_SIZE,
          1,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          curveTableToRgba8(curve),
        );
        lastCurveTable = curve;
      }

      // トーンカーブ uniform（未指定時は enabled=0 でサンプリングをスキップ）
      if (curveEnabledLocation) {
        gl.uniform1f(curveEnabledLocation, curve ? 1 : 0);
      }

      // LUT uniform をアップロード（未指定時は enabled=0 でサンプリングをスキップ）
      if (lutEnabledLocation) {
        gl.uniform1f(lutEnabledLocation, lut ? 1 : 0);
      }
      if (lut) {
        if (lutSizeLocation) {
          gl.uniform1f(lutSizeLocation, lut.data.size);
        }
        if (lutStrengthLocation) {
          gl.uniform1f(lutStrengthLocation, lut.strength);
        }
        if (lutDomainMinLocation) {
          gl.uniform3f(lutDomainMinLocation, ...lut.data.domainMin);
        }
        if (lutDomainMaxLocation) {
          gl.uniform3f(lutDomainMaxLocation, ...lut.data.domainMax);
        }
      }

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const dispose = () => {
      gl.deleteTexture(texture);
      gl.deleteTexture(lutTexture);
      gl.deleteTexture(curveTexture);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };

    return { render, canvas, dispose };
  } catch (error) {
    console.warn("Failed to create WebGL adjustment renderer:", error);
    return null;
  }
};

/**
 * Canvas2D + 純粋関数による CPU フォールバック。
 * ソースを width×height の 2D canvas に描画し、全画素へ `applyAdjustmentToPixel` を適用する。
 */
const renderWithCanvas2D = (
  source: EditableSource,
  width: number,
  height: number,
  normalized: NormalizedAdjustments,
  lut: LutApplication | null,
  curve: Float32Array | null,
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is not supported");
  }
  ctx.drawImage(source, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  // ディテール（シャープネス / 明瞭度）は近傍参照が必要なため、使用時のみソースの
  // 輝度平面を前処理で 1 回構築する（値 0 なら構築もタップも完全スキップ = 既存性能不変）
  const hasDetail = normalized.sharpness > 0 || normalized.clarity !== 0;
  const lumaPlane = hasDetail ? computeLumaPlane(data, width, height) : null;
  const stride = clarityStride(width, height);
  const hasVignette = normalized.vignette !== 0;
  const hasGrain = normalized.grain > 0;
  let i = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, i += 4) {
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;
      // GPU パスと同順: ディテール → 調整 → トーンカーブ → LUT → ビネット → グレイン → 最終クランプ
      if (lumaPlane) {
        const delta = detailDeltaAt(
          lumaPlane,
          width,
          height,
          x,
          y,
          stride,
          normalized.sharpness,
          normalized.clarity,
        );
        r = clamp01(r + delta);
        g = clamp01(g + delta);
        b = clamp01(b + delta);
      }
      [r, g, b] = applyAdjustmentToPixel(r, g, b, normalized);
      if (curve) {
        [r, g, b] = applyToneCurveToPixel(r, g, b, curve);
      }
      if (lut) {
        [r, g, b] = applyLutToPixel(r, g, b, lut.data, lut.strength);
      }
      if (hasVignette) {
        const factor = vignetteFactorAt(
          x,
          y,
          width,
          height,
          normalized.vignette,
        );
        r *= factor;
        g *= factor;
        b *= factor;
      }
      if (hasGrain) {
        const noise = grainNoiseAt(x, y) * normalized.grain * GRAIN_STRENGTH;
        r += noise;
        g += noise;
        b += noise;
      }
      // 最終クランプ（GPU の手順 14 と対応。ビネット負値 / グレインで [0,1] を超え得る）
      data[i] = Math.round(clamp01(r) * 255);
      data[i + 1] = Math.round(clamp01(g) * 255);
      data[i + 2] = Math.round(clamp01(b) * 255);
      // アルファは維持
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

/**
 * ソース画像へ調整を適用した canvas を返す。
 * renderer（WebGL）があれば GPU で描画してその canvas を返し、無ければ CPU フォールバックで
 * 新しい 2D canvas を返す。プレビュー（画面転写）と出力（Blob 化）の両方で同一経路を通すことで
 * WYSIWYG を構造的に保証する。
 */
export const applyAdjustmentsToCanvas = (
  source: EditableSource,
  width: number,
  height: number,
  normalized: NormalizedAdjustments,
  renderer: AdjustmentRenderer | null,
  lut: LutApplication | null = null,
  curve: Float32Array | null = null,
): HTMLCanvasElement => {
  if (renderer) {
    renderer.render(source, width, height, normalized, lut, curve);
    return renderer.canvas;
  }
  return renderWithCanvas2D(source, width, height, normalized, lut, curve);
};
