import { describe, expect, it, vi } from "vitest";
import {
  calculateTargetSize,
  convertMultipleImages,
  FLATTEN_BACKGROUND_COLOR,
  resolveFlattenBackground,
  searchQualityForTargetSize,
} from "../imageConverter";

// convertImage 本体は Canvas / Image / WASM 依存のため単体テスト対象外（E2E で検証する）

describe("calculateTargetSize", () => {
  it("サイズ指定がない場合は元のサイズを返す", () => {
    expect(
      calculateTargetSize(800, 600, { maintainAspectRatio: true }),
    ).toEqual({ width: 800, height: 600 });
    expect(
      calculateTargetSize(800, 600, { maintainAspectRatio: false }),
    ).toEqual({ width: 800, height: 600 });
  });

  it("アスペクト比維持で幅のみ指定した場合は高さを比率で計算する", () => {
    expect(
      calculateTargetSize(800, 600, { width: 400, maintainAspectRatio: true }),
    ).toEqual({ width: 400, height: 300 });
  });

  it("アスペクト比維持で高さのみ指定した場合は幅を比率で計算する", () => {
    expect(
      calculateTargetSize(800, 600, {
        height: 300,
        maintainAspectRatio: true,
      }),
    ).toEqual({ width: 400, height: 300 });
  });

  it("アスペクト比維持で両方指定した場合は収まる方に合わせる", () => {
    // 横長画像（4:3）を正方形枠（1:1）に収める → 幅に合わせる
    expect(
      calculateTargetSize(800, 600, {
        width: 400,
        height: 400,
        maintainAspectRatio: true,
      }),
    ).toEqual({ width: 400, height: 300 });

    // 縦長画像（3:4）を正方形枠（1:1）に収める → 高さに合わせる
    expect(
      calculateTargetSize(600, 800, {
        width: 400,
        height: 400,
        maintainAspectRatio: true,
      }),
    ).toEqual({ width: 300, height: 400 });
  });

  it("アスペクト比維持なしの場合は指定値をそのまま使う", () => {
    expect(
      calculateTargetSize(800, 600, {
        width: 100,
        height: 500,
        maintainAspectRatio: false,
      }),
    ).toEqual({ width: 100, height: 500 });
  });

  it("アスペクト比維持なしで片方のみ指定した場合は残りは元のサイズを使う", () => {
    expect(
      calculateTargetSize(800, 600, {
        width: 100,
        maintainAspectRatio: false,
      }),
    ).toEqual({ width: 100, height: 600 });
  });
});

describe("resolveFlattenBackground", () => {
  it("JPEG 出力では品質によらず背景色を返す（アルファ非対応）", () => {
    expect(resolveFlattenBackground("jpeg", 90)).toBe(FLATTEN_BACKGROUND_COLOR);
    expect(resolveFlattenBackground("jpeg", 10)).toBe(FLATTEN_BACKGROUND_COLOR);
    expect(resolveFlattenBackground("jpeg")).toBe(FLATTEN_BACKGROUND_COLOR);
  });

  it("PNG の低品質ティア（jpeg-roundtrip、quality < 70）では背景色を返す", () => {
    expect(resolveFlattenBackground("png", 69)).toBe(FLATTEN_BACKGROUND_COLOR);
    expect(resolveFlattenBackground("png", 10)).toBe(FLATTEN_BACKGROUND_COLOR);
  });

  it("PNG の lossless / compressed ティアでは null を返す（アルファ保持）", () => {
    expect(resolveFlattenBackground("png", 95)).toBeNull();
    expect(resolveFlattenBackground("png", 70)).toBeNull();
  });

  it("PNG で quality 未指定の場合は null を返す（ネイティブエンコード経路はアルファ保持）", () => {
    expect(resolveFlattenBackground("png")).toBeNull();
  });

  it("WebP / AVIF では null を返す（アルファ保持）", () => {
    expect(resolveFlattenBackground("webp", 10)).toBeNull();
    expect(resolveFlattenBackground("webp", 90)).toBeNull();
    expect(resolveFlattenBackground("avif", 10)).toBeNull();
    expect(resolveFlattenBackground("avif", 90)).toBeNull();
  });
});

describe("convertMultipleImages", () => {
  // 画像以外のファイルは Canvas 到達前に reject されるため happy-dom でも検証できる
  // （成功経路は Canvas 依存のため E2E で検証する）
  it("変換に失敗したファイルを failures として収集し処理を続行する", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const invalidFiles = [
      new File(["not an image"], "note.txt", { type: "text/plain" }),
      new File(["also not an image"], "data.csv", { type: "text/csv" }),
    ];

    const progressCalls: Array<[number, number]> = [];
    const { results, failures } = await convertMultipleImages(
      invalidFiles,
      { format: "jpeg", quality: 90, maintainAspectRatio: true },
      (current, total) => {
        progressCalls.push([current, total]);
      },
    );

    expect(results).toEqual([]);
    expect(failures).toHaveLength(2);
    expect(failures.map((f) => f.fileName)).toEqual(["note.txt", "data.csv"]);
    // 失敗したファイルも進捗にカウントされる
    expect(progressCalls).toEqual([
      [1, 2],
      [2, 2],
    ]);
    vi.restoreAllMocks();
  });
});

describe("searchQualityForTargetSize", () => {
  // 指定バイト数の Blob を生成する（ascii 文字列は 1 文字 1 バイトなので size が length と一致する）
  const blobOfSize = (bytes: number): Blob => new Blob(["x".repeat(bytes)]);

  // 品質に比例したサイズ（size = quality * 100）を返す単調増加エンコーダー
  const linearEncoder = () => {
    const qualities: number[] = [];
    const encode = (quality: number): Promise<Blob> => {
      qualities.push(quality);
      return Promise.resolve(blobOfSize(quality * 100));
    };
    return { encode, qualities };
  };

  it("目標以下で最大品質となる Blob を返す", async () => {
    const { encode } = linearEncoder();
    // target 5000 バイト → 品質 50（5000 バイト）が目標以下の最大品質
    const result = await searchQualityForTargetSize(encode, 5000);
    expect(result.achieved).toBe(true);
    expect(result.quality).toBe(50);
    expect(result.blob.size).toBe(5000);
    expect(result.blob.size).toBeLessThanOrEqual(5000);
  });

  it("目標が最大品質のサイズ以上なら最大品質を返す", async () => {
    const { encode } = linearEncoder();
    // 品質 100 でも 10000 バイトで、target 20000 は余裕で達成可能 → 最大品質 100
    const result = await searchQualityForTargetSize(encode, 20000);
    expect(result.achieved).toBe(true);
    expect(result.quality).toBe(100);
    expect(result.blob.size).toBe(10000);
  });

  it("最低品質でも目標を超える場合は最小サイズの結果をフォールバックとして返す", async () => {
    const { encode } = linearEncoder();
    // 品質 1 でも 100 バイトあり、target 50 は達成不可 → 最小サイズ（品質 1）を返す
    const result = await searchQualityForTargetSize(encode, 50);
    expect(result.achieved).toBe(false);
    expect(result.quality).toBe(1);
    expect(result.blob.size).toBe(100);
  });

  it("反復回数の上限を超えてエンコードしない", async () => {
    const { encode, qualities } = linearEncoder();
    const result = await searchQualityForTargetSize(encode, 5000, {
      maxIterations: 2,
    });
    // 2 回だけエンコードして、その時点で見つかった目標以下の候補を返す
    expect(qualities).toHaveLength(2);
    expect(result.achieved).toBe(true);
    expect(result.blob.size).toBeLessThanOrEqual(5000);
  });

  it("maxIterations が 0 の場合は末尾ガードで minQuality を 1 回だけエンコードして返す", async () => {
    // 探索ループが一度も回らず best/smallest がともに null になる防御的分岐を検証する
    const { encode, qualities } = linearEncoder();
    // 目標 5000 バイトなら minQuality(=1, 100 バイト) は達成可能
    const achievedResult = await searchQualityForTargetSize(encode, 5000, {
      maxIterations: 0,
    });
    // 末尾ガードで minQuality のみを 1 回エンコードする
    expect(qualities).toEqual([1]);
    expect(achievedResult.quality).toBe(1);
    expect(achievedResult.blob.size).toBe(100);
    expect(achievedResult.achieved).toBe(true);

    // 目標 50 バイトなら minQuality(100 バイト) でも超過するため achieved は false
    const { encode: encode2 } = linearEncoder();
    const unachievedResult = await searchQualityForTargetSize(encode2, 50, {
      maxIterations: 0,
    });
    expect(unachievedResult.quality).toBe(1);
    expect(unachievedResult.achieved).toBe(false);
  });

  it("カスタムの品質範囲内でのみ探索する", async () => {
    const { encode, qualities } = linearEncoder();
    const result = await searchQualityForTargetSize(encode, 5000, {
      minQuality: 10,
      maxQuality: 20,
    });
    // 範囲内（10-20）は全て 5000 バイト以下なので最大の品質 20 を返す
    expect(result.achieved).toBe(true);
    expect(result.quality).toBe(20);
    // 探索した品質はすべて指定範囲内
    for (const q of qualities) {
      expect(q).toBeGreaterThanOrEqual(10);
      expect(q).toBeLessThanOrEqual(20);
    }
  });

  it("単調性が崩れても達成時は必ず目標以下の Blob を返す", async () => {
    // 品質とサイズが単調増加しないエンコーダー（低品質で大・高品質で小）
    const encode = (quality: number): Promise<Blob> =>
      Promise.resolve(blobOfSize(quality <= 30 ? 8000 : 1000));
    const result = await searchQualityForTargetSize(encode, 2000);
    // 達成した場合、返す Blob は必ず目標以下（誤って目標超過を採用しない）
    expect(result.achieved).toBe(true);
    expect(result.blob.size).toBeLessThanOrEqual(2000);
  });
});
