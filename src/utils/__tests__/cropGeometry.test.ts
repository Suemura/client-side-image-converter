import { describe, expect, it } from "vitest";
import {
  ASPECT_RATIO_PRESETS,
  clampCropArea,
  clampCropAreaToAspect,
  enforceAspectRatio,
  fitAspectRatio,
  orientedSize,
  rotateLeft,
  rotateRight,
  scaleCropArea,
  toDisplayArea,
} from "../cropGeometry";

describe("rotateRight / rotateLeft", () => {
  it("右回転は 90 度ずつ進み 360 で 0 に戻る", () => {
    expect(rotateRight(0)).toBe(90);
    expect(rotateRight(90)).toBe(180);
    expect(rotateRight(180)).toBe(270);
    expect(rotateRight(270)).toBe(0);
  });

  it("左回転は 90 度ずつ戻り 0 の次は 270", () => {
    expect(rotateLeft(0)).toBe(270);
    expect(rotateLeft(270)).toBe(180);
    expect(rotateLeft(90)).toBe(0);
  });
});

describe("orientedSize", () => {
  it("0 / 180 度は寸法そのまま", () => {
    expect(orientedSize(400, 200, 0)).toEqual({ width: 400, height: 200 });
    expect(orientedSize(400, 200, 180)).toEqual({ width: 400, height: 200 });
  });

  it("90 / 270 度は幅と高さが入れ替わる", () => {
    expect(orientedSize(400, 200, 90)).toEqual({ width: 200, height: 400 });
    expect(orientedSize(400, 200, 270)).toEqual({ width: 200, height: 400 });
  });
});

describe("clampCropArea", () => {
  it("最小サイズ未満は最小サイズへ引き上げる", () => {
    const result = clampCropArea({ x: 0, y: 0, width: 2, height: 3 }, 100, 100);
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
  });

  it("負の原点は 0 にクランプする", () => {
    const result = clampCropArea(
      { x: -20, y: -5, width: 30, height: 30 },
      100,
      100,
    );
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it("右端・下端をはみ出す領域は境界内に収める", () => {
    const result = clampCropArea(
      { x: 80, y: 80, width: 50, height: 50 },
      100,
      100,
    );
    expect(result.x + result.width).toBeLessThanOrEqual(100);
    expect(result.y + result.height).toBeLessThanOrEqual(100);
  });

  it("原点が境界端に張り付く場合は最小サイズを保ちつつ内側へ寄せる", () => {
    const result = clampCropArea(
      { x: 98, y: 98, width: 40, height: 40 },
      100,
      100,
    );
    expect(result.x).toBe(90);
    expect(result.width).toBe(10);
    expect(result.y).toBe(90);
    expect(result.height).toBe(10);
  });
});

describe("clampCropAreaToAspect", () => {
  it("ratio が null のときは clampCropArea と同じ挙動（比率非考慮）", () => {
    const area = { x: 80, y: 80, width: 50, height: 50 };
    expect(clampCropAreaToAspect(area, "se", null, 100, 100)).toEqual(
      clampCropArea(area, 100, 100),
    );
  });

  it("move ハンドルは通常の clampCropArea へ委譲する", () => {
    const area = { x: 80, y: 80, width: 50, height: 50 };
    expect(clampCropAreaToAspect(area, "move", 1, 100, 100)).toEqual(
      clampCropArea(area, 100, 100),
    );
  });

  it("se（左上固定）で右下端に到達しても 1:1 が崩れない", () => {
    // maxWidth = maxHeight = 20 → 一様に 0.5 倍
    const result = clampCropAreaToAspect(
      { x: 80, y: 80, width: 40, height: 40 },
      "se",
      1,
      100,
      100,
    );
    expect(result).toEqual({ x: 80, y: 80, width: 20, height: 20 });
    expect(result.x + result.width).toBeLessThanOrEqual(100);
    expect(result.y + result.height).toBeLessThanOrEqual(100);
  });

  it("se で幅・高さの余白が異なる場合は厳しい方に合わせて比率を保つ", () => {
    // maxWidth = 30, maxHeight = 20 → scale = 0.5
    const result = clampCropAreaToAspect(
      { x: 70, y: 80, width: 40, height: 40 },
      "se",
      1,
      100,
      100,
    );
    expect(result.width).toBeCloseTo(result.height, 5);
    expect(result.x + result.width).toBeLessThanOrEqual(100);
    expect(result.y + result.height).toBeLessThanOrEqual(100);
  });

  it("nw（右下固定）は原点が負でも右下角を保ち境界内へ収める", () => {
    const result = clampCropAreaToAspect(
      { x: -10, y: -10, width: 50, height: 50 },
      "nw",
      1,
      100,
      100,
    );
    // 右下角 (40, 40) を固定したまま比率維持で境界内へ
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.x + result.width).toBeCloseTo(40, 5);
    expect(result.y + result.height).toBeCloseTo(40, 5);
    expect(result.width).toBeCloseTo(result.height, 5);
  });

  it("n（下端固定・水平中心維持）は比率を保ちアンカーを維持する", () => {
    const result = clampCropAreaToAspect(
      { x: 10, y: -20, width: 80, height: 80 },
      "n",
      1,
      100,
      100,
    );
    expect(result.width).toBeCloseTo(result.height, 5);
    // 下端 60 を固定
    expect(result.y + result.height).toBeCloseTo(60, 5);
    // 水平中心 50 を維持
    expect(result.x + result.width / 2).toBeCloseTo(50, 5);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });

  it("非正方形の比率（2:1）も端で維持される", () => {
    // se: maxWidth = maxHeight = 40 → scale = min(1, 40/60, 40/30) = 2/3
    const result = clampCropAreaToAspect(
      { x: 60, y: 60, width: 60, height: 30 },
      "se",
      2,
      100,
      100,
    );
    expect(result.width / result.height).toBeCloseTo(2, 5);
    expect(result.x + result.width).toBeLessThanOrEqual(100);
    expect(result.y + result.height).toBeLessThanOrEqual(100);
  });

  it("極端に小さくなる場合も最小サイズと比率を保つ", () => {
    const result = clampCropAreaToAspect(
      { x: 95, y: 95, width: 40, height: 40 },
      "se",
      1,
      100,
      100,
    );
    expect(result.width).toBeGreaterThanOrEqual(10);
    expect(result.height).toBeGreaterThanOrEqual(10);
    expect(result.width).toBeCloseTo(result.height, 5);
  });
});

describe("scaleCropArea", () => {
  it("表示座標を自然座標へ拡大し丸める", () => {
    const result = scaleCropArea(
      { x: 10, y: 20, width: 30, height: 40 },
      2,
      2,
      200,
      200,
    );
    expect(result).toEqual({ x: 20, y: 40, width: 60, height: 80 });
  });

  it("変換後に画像境界を超えないよう幅・高さを詰める", () => {
    const result = scaleCropArea(
      { x: 90, y: 90, width: 30, height: 30 },
      2,
      2,
      200,
      200,
    );
    expect(result.x + result.width).toBeLessThanOrEqual(200);
    expect(result.y + result.height).toBeLessThanOrEqual(200);
  });
});

describe("toDisplayArea", () => {
  it("自然座標を表示座標へ縮小する（scaleCropArea の逆）", () => {
    const natural = { x: 20, y: 40, width: 60, height: 80 };
    const display = toDisplayArea(natural, 2, 2);
    expect(display).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });
});

describe("fitAspectRatio", () => {
  it("ratio が null（自由）はそのまま返す", () => {
    const area = { x: 0, y: 0, width: 40, height: 20 };
    expect(fitAspectRatio(area, null)).toEqual(area);
  });

  it("横長領域に 1:1 を当てると正方形に収まる", () => {
    const result = fitAspectRatio({ x: 0, y: 0, width: 40, height: 20 }, 1);
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
  });

  it("縦長領域に 16:9 を当てると幅基準で高さが縮む", () => {
    const result = fitAspectRatio(
      { x: 0, y: 0, width: 90, height: 200 },
      16 / 9,
    );
    // 幅 90 → 高さ 50.625 で領域内に収まる
    expect(result.width).toBe(90);
    expect(result.height).toBeCloseTo(50.625, 3);
  });
});

describe("enforceAspectRatio", () => {
  it("move / null は補正しない", () => {
    const area = { x: 0, y: 0, width: 40, height: 25 };
    expect(enforceAspectRatio(area, "move", 1)).toEqual(area);
    expect(enforceAspectRatio(area, "se", null)).toEqual(area);
  });

  it("se（左上固定）は幅基準で高さを比率に合わせる", () => {
    const result = enforceAspectRatio(
      { x: 0, y: 0, width: 40, height: 100 },
      "se",
      1,
    );
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBe(40);
    expect(result.height).toBe(40);
  });

  it("nw（右下固定）は右下角を保ったまま比率補正する", () => {
    const result = enforceAspectRatio(
      { x: 10, y: 10, width: 40, height: 100 },
      "nw",
      1,
    );
    // 右下角 (50, 110) を固定
    expect(result.x + result.width).toBeCloseTo(50, 5);
    expect(result.y + result.height).toBeCloseTo(110, 5);
    expect(result.width).toBe(40);
    expect(result.height).toBe(40);
  });

  it("n（下端固定・水平中心維持）は高さ基準で幅を導出する", () => {
    const result = enforceAspectRatio(
      { x: 0, y: 0, width: 200, height: 50 },
      "n",
      1,
    );
    expect(result.height).toBe(50);
    expect(result.width).toBe(50);
    // 下端 50 を固定
    expect(result.y + result.height).toBeCloseTo(50, 5);
    // 水平中心 100 を維持
    expect(result.x + result.width / 2).toBeCloseTo(100, 5);
  });
});

describe("ASPECT_RATIO_PRESETS", () => {
  it("自由を含む 5 種のプリセットを持ち free の ratio は null", () => {
    expect(ASPECT_RATIO_PRESETS).toHaveLength(5);
    const free = ASPECT_RATIO_PRESETS.find((p) => p.id === "free");
    expect(free?.ratio).toBeNull();
    const square = ASPECT_RATIO_PRESETS.find((p) => p.id === "1:1");
    expect(square?.ratio).toBe(1);
  });
});
