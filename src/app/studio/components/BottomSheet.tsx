import type React from "react";
import styles from "./BottomSheet.module.css";

interface BottomSheetProps {
  children: React.ReactNode;
}

/** スマホ版のボトムシート（選択中ツールの操作 UI の器。下タブバーの直上に置く） */
export const BottomSheet: React.FC<BottomSheetProps> = ({ children }) => {
  return (
    <div className={styles.sheet}>
      <div className={styles.handle} />
      <div className={styles.content}>{children}</div>
    </div>
  );
};
