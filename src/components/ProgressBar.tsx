// ファイルパス: /Users/suemura/Documents/GitHub/web-image-converter/src/components/ProgressBar.tsx
import type React from "react";

interface ProgressBarProps {
  current: number;
  total: number;
  isVisible: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  total,
  isVisible,
}) => {
  if (!isVisible || total === 0) {
    return null;
  }

  const percentage = Math.round((current / total) * 100);

  return (
    <div
      style={{
        backgroundColor: "white",
        borderRadius: "16px",
        border: "1px solid var(--border-dashed)",
        padding: "24px",
        marginTop: "24px",
      }}
    >
      <div style={{ marginBottom: "12px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "8px",
          }}
        >
          <h4
            style={{
              fontSize: "16px",
              fontWeight: "600",
              color: "var(--foreground)",
            }}
          >
            変換中...
          </h4>
          <span style={{ fontSize: "14px", color: "var(--muted-foreground)" }}>
            {current} / {total} ({percentage}%)
          </span>
        </div>

        {/* プログレスバー */}
        <div
          style={{
            width: "100%",
            height: "8px",
            backgroundColor: "#f3f4f6",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${percentage}%`,
              height: "100%",
              backgroundColor: "var(--primary)",
              borderRadius: "4px",
              transition: "width 0.3s ease-in-out",
            }}
          />
        </div>
      </div>

      <p
        style={{
          fontSize: "14px",
          color: "var(--muted-foreground)",
          textAlign: "center",
        }}
      >
        ファイルを変換しています。しばらくお待ちください...
      </p>
    </div>
  );
};
