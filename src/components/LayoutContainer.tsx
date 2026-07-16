import type React from "react";
import { Footer } from "./Footer";
import styles from "./LayoutContainer.module.css";

interface LayoutContainerProps {
  children: React.ReactNode;
}

export const LayoutContainer: React.FC<LayoutContainerProps> = ({
  children,
}) => {
  return (
    <div className={styles.container}>
      <div className={styles.content}>{children}</div>
      <Footer />
    </div>
  );
};
