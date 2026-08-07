import { describe, expect, it } from "vitest";
import {
  countByCategory,
  DETECTION_PADDING_RATIO,
  decodeFaceOutputs,
  decodePlateOutputs,
  expandDetectionRect,
  generatePlatePriors,
  type NormalizedBox,
  nonMaxSuppression,
  normalizedBoxToRect,
  PLATE_INPUT_HEIGHT,
  PLATE_INPUT_WIDTH,
  rgbaToFaceTensor,
  rgbaToPlateTensor,
} from "../detectionCore";

describe("rgbaToFaceTensor", () => {
  it("RGB 順で (v - 127) / 128 に正規化する", () => {
    // 1px: R=255, G=127, B=0（アルファは無視）
    const rgba = new Uint8ClampedArray([255, 127, 0, 128]);
    const tensor = rgbaToFaceTensor(rgba, 1, 1);
    expect(tensor).toHaveLength(3);
    expect(tensor[0]).toBeCloseTo(1);
    expect(tensor[1]).toBeCloseTo(0);
    expect(tensor[2]).toBeCloseTo(-0.9921875);
  });

  it("チャンネルを平面順（NCHW）で並べる", () => {
    // 2px: 1px 目 R=255, 2px 目 G=255
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const tensor = rgbaToFaceTensor(rgba, 2, 1);
    // R 平面 → G 平面 → B 平面
    expect(tensor[0]).toBeCloseTo(1); // R of px0
    expect(tensor[1]).toBeCloseTo(-0.9921875); // R of px1
    expect(tensor[2]).toBeCloseTo(-0.9921875); // G of px0
    expect(tensor[3]).toBeCloseTo(1); // G of px1
  });
});

describe("rgbaToPlateTensor", () => {
  it("BGR 順・生の 0..255 値で並べる", () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255]);
    const tensor = rgbaToPlateTensor(rgba, 1, 1);
    expect(Array.from(tensor)).toEqual([30, 20, 10]);
  });
});

describe("generatePlatePriors", () => {
  it("320×240 入力で 4385 個のプライアを生成する（公式実装と同数）", () => {
    const priors = generatePlatePriors();
    expect(priors.length).toBe(4385 * 4);
  });

  it("先頭プライアは stride 8 のセル中心・min_size 10", () => {
    const priors = generatePlatePriors();
    expect(priors[0]).toBeCloseTo((0.5 * 8) / PLATE_INPUT_WIDTH); // cx
    expect(priors[1]).toBeCloseTo((0.5 * 8) / PLATE_INPUT_HEIGHT); // cy
    expect(priors[2]).toBeCloseTo(10 / PLATE_INPUT_WIDTH); // s_kx
    expect(priors[3]).toBeCloseTo(10 / PLATE_INPUT_HEIGHT); // s_ky
  });
});

describe("decodeFaceOutputs", () => {
  it("しきい値を超えた候補だけを corner 形式のまま返す", () => {
    // 2 アンカー: [背景, 顔] = [0.2, 0.8], [0.9, 0.1]
    const scores = new Float32Array([0.2, 0.8, 0.9, 0.1]);
    const boxes = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.5, 0.9, 0.9]);
    const result = decodeFaceOutputs(scores, boxes, 0.7);
    expect(result).toHaveLength(1);
    // Float32Array 経由のため float32 精度で比較する
    expect(result[0].x1).toBeCloseTo(0.1);
    expect(result[0].y1).toBeCloseTo(0.2);
    expect(result[0].x2).toBeCloseTo(0.3);
    expect(result[0].y2).toBeCloseTo(0.4);
    expect(result[0].score).toBeCloseTo(0.8);
  });
});

describe("decodePlateOutputs", () => {
  const makeInputs = () => {
    const priors = new Float32Array([0.5, 0.5, 0.1, 0.2]);
    const loc = new Float32Array(14);
    // 4 隅点（列 4:6, 6:8, 10:12, 12:14）
    loc[4] = 1;
    loc[5] = 1;
    loc[6] = -1;
    loc[7] = -1;
    loc[10] = 2;
    loc[11] = 0;
    loc[12] = 0;
    loc[13] = 2;
    const conf = new Float32Array([0.1, 0.9]);
    const iou = new Float32Array([1.5]); // 1 へクランプされる
    return { priors, loc, conf, iou };
  };

  it("4 隅点をプライアで復号し外接矩形とスコア sqrt(cls×iou) を返す", () => {
    const { priors, loc, conf, iou } = makeInputs();
    const result = decodePlateOutputs(loc, conf, iou, priors, 0.8);
    expect(result).toHaveLength(1);
    const box = result[0];
    // 変位 = loc × variance(0.1) × プライアサイズ
    expect(box.x1).toBeCloseTo(0.5 - 1 * 0.1 * 0.1); // 0.49
    expect(box.y1).toBeCloseTo(0.5 - 1 * 0.1 * 0.2); // 0.48
    expect(box.x2).toBeCloseTo(0.5 + 2 * 0.1 * 0.1); // 0.52
    expect(box.y2).toBeCloseTo(0.5 + 2 * 0.1 * 0.2); // 0.54
    expect(box.score).toBeCloseTo(Math.sqrt(0.9 * 1));
  });

  it("列 8:10 は 4 隅点に使わない（公式実装と同じ列選択）", () => {
    const { priors, loc, conf, iou } = makeInputs();
    loc[8] = 100;
    loc[9] = 100;
    const result = decodePlateOutputs(loc, conf, iou, priors, 0.8);
    expect(result[0].x2).toBeCloseTo(0.52);
    expect(result[0].y2).toBeCloseTo(0.54);
  });

  it("IoU 予測が負のときは 0 へクランプされスコア 0 で除外される", () => {
    const { priors, loc, conf } = makeInputs();
    const iou = new Float32Array([-0.5]);
    expect(decodePlateOutputs(loc, conf, iou, priors, 0.8)).toHaveLength(0);
  });
});

describe("nonMaxSuppression", () => {
  const box = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    score: number,
  ): NormalizedBox => ({ x1, y1, x2, y2, score });

  it("重なる候補はスコアの高い方だけ残す", () => {
    const boxes = [box(0, 0, 0.5, 0.5, 0.8), box(0.02, 0.02, 0.52, 0.52, 0.9)];
    const result = nonMaxSuppression(boxes, 0.3);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(0.9);
  });

  it("重ならない候補はすべて残す", () => {
    const boxes = [box(0, 0, 0.2, 0.2, 0.8), box(0.5, 0.5, 0.9, 0.9, 0.9)];
    expect(nonMaxSuppression(boxes, 0.3)).toHaveLength(2);
  });

  it("入力配列を変更しない", () => {
    const boxes = [box(0, 0, 0.2, 0.2, 0.5), box(0.5, 0.5, 0.9, 0.9, 0.9)];
    const before = [...boxes];
    nonMaxSuppression(boxes, 0.3);
    expect(boxes).toEqual(before);
  });
});

describe("normalizedBoxToRect", () => {
  it("正規化座標を自然座標の矩形へ変換する", () => {
    const rect = normalizedBoxToRect(
      { x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.6, score: 1 },
      1000,
      500,
    );
    expect(rect).toEqual({ x: 100, y: 100, width: 400, height: 200 });
  });

  it("画像境界外へはみ出す座標はクランプする", () => {
    const rect = normalizedBoxToRect(
      { x1: -0.2, y1: -0.1, x2: 1.3, y2: 1.1, score: 1 },
      100,
      100,
    );
    expect(rect).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it("1px 未満に潰れる候補は null を返す", () => {
    expect(
      normalizedBoxToRect(
        { x1: 0.5, y1: 0.1, x2: 0.5, y2: 0.9, score: 1 },
        100,
        100,
      ),
    ).toBeNull();
  });
});

describe("expandDetectionRect", () => {
  it("片側あたり幅・高さの paddingRatio ぶん広げる", () => {
    const rect = expandDetectionRect(
      { x: 100, y: 100, width: 100, height: 200 },
      1000,
      1000,
      0.15,
    );
    expect(rect).toEqual({ x: 85, y: 70, width: 130, height: 260 });
  });

  it("画像境界でクランプする", () => {
    const rect = expandDetectionRect(
      { x: 0, y: 0, width: 100, height: 100 },
      110,
      110,
      0.2,
    );
    expect(rect).toEqual({ x: 0, y: 0, width: 110, height: 110 });
  });

  it("既定のパディング係数は 0.15", () => {
    expect(DETECTION_PADDING_RATIO).toBe(0.15);
  });
});

describe("countByCategory", () => {
  it("カテゴリ別の件数を数える", () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(
      countByCategory([
        { category: "face", rect, score: 1 },
        { category: "face", rect, score: 1 },
        { category: "plate", rect, score: 1 },
      ]),
    ).toEqual({ face: 2, plate: 1 });
  });

  it("空配列では全カテゴリ 0", () => {
    expect(countByCategory([])).toEqual({ face: 0, plate: 0 });
  });
});
