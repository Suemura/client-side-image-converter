"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { LutData } from "../../../utils/lutParser";
import type { LutSelection } from "../../../utils/lutState";
import type { LutApplication } from "../../../utils/webglImageRenderer";

/** useLutRegistry の返却値 */
export interface LutRegistry {
  /** 現在表示中の画像へ適用する LUT（未選択・レジストリ未登録時は null） */
  currentLut: LutApplication | null;
  /** 選択を LUT データ + 強度へ解決する（出力ジョブ構築用） */
  resolveLutApplication: (selection: LutSelection) => LutApplication | null;
  /** 読み込んだ LUT データをレジストリへ登録する（LutPicker から呼ばれる） */
  registerLut: (id: string, data: LutData) => void;
  /** アップロード済みカスタム LUT の表示名（未アップロードは null） */
  customLutName: string | null;
  setCustomLutName: (name: string | null) => void;
}

/**
 * 選択された LUT データの実体を保持するレジストリ（lutId → LutData）を管理する
 * edit ページ固有フック。状態には軽量な選択（lutId + strength）だけを持ち、
 * 重いデータ本体は ref で参照する。
 */
export function useLutRegistry(currentSelection: LutSelection): LutRegistry {
  const lutRegistryRef = useRef<Map<string, LutData>>(new Map());
  const [customLutName, setCustomLutName] = useState<string | null>(null);
  // レジストリ更新（プリセット読み込み・カスタム上書き）を currentLut の再解決へ伝えるバージョン。
  // ref は再レンダーを起こさないため、登録時にこのカウンタを進めて useMemo を無効化する。
  const [lutRegistryVersion, setLutRegistryVersion] = useState(0);

  // 選択を LUT データ + 強度へ解決する（レジストリ未登録時は null）
  const resolveLutApplication = useCallback(
    (selection: LutSelection): LutApplication | null => {
      if (!selection.lutId) {
        return null;
      }
      const data = lutRegistryRef.current.get(selection.lutId);
      if (!data) {
        return null;
      }
      return { data, strength: selection.strength / 100 };
    },
    [],
  );

  // カスタム LUT の再アップロードは同一スロット（CUSTOM_LUT_ID）を上書きするため、
  // データが実際に変わった場合のみバージョンを進めてプレビューの再解決を促す。
  const registerLut = useCallback((id: string, data: LutData) => {
    const prev = lutRegistryRef.current.get(id);
    lutRegistryRef.current.set(id, data);
    if (prev !== data) {
      setLutRegistryVersion((v) => v + 1);
    }
  }, []);

  // currentLut は毎レンダーで新オブジェクトになると CompareView の編集後描画（CPU パスは全画素ループ）を
  // 無関係な再レンダー（進捗更新など）でも再発火させるため、選択・レジストリ版が変わったときだけ再解決する。
  // lutRegistryVersion は ref レジストリ（コールバック本体からは読まれない）の更新を反映するための意図的な依存。
  // biome-ignore lint/correctness/useExhaustiveDependencies: lutRegistryVersion は ref レジストリ更新の再解決トリガ
  const currentLut = useMemo(
    () => resolveLutApplication(currentSelection),
    [resolveLutApplication, currentSelection, lutRegistryVersion],
  );

  return {
    currentLut,
    resolveLutApplication,
    registerLut,
    customLutName,
    setCustomLutName,
  };
}
