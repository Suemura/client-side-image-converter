import { describe, expect, it } from "vitest";
import { calculateTargetSize } from "../imageConverter";

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
