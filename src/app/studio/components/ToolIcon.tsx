import type React from "react";
import type { StudioToolId } from "../../../utils/studioCore";

interface ToolIconProps {
  tool: StudioToolId;
  size?: number;
}

/** ツールレール / タブバーで共有する 6 ツールのアイコン（デザインモック準拠） */
export const ToolIcon: React.FC<ToolIconProps> = ({ tool, size = 20 }) => {
  const common = {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (tool) {
    case "crop":
      return (
        <svg {...common}>
          <path d="M6 2v14a2 2 0 0 0 2 2h14" />
          <path d="M18 22V8a2 2 0 0 0-2-2H2" />
        </svg>
      );
    case "adjust":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8" />
        </svg>
      );
    case "retouch":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "upscale":
      return (
        <svg {...common}>
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      );
    case "removebg":
      return (
        <svg {...common}>
          <path d="M20 20H8.5L4 15.5a2 2 0 0 1 0-2.8L13.7 3a2 2 0 0 1 2.8 0l4.5 4.5a2 2 0 0 1 0 2.8L11.5 20" />
          <line x1="9" y1="8" x2="16" y2="15" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
  }
};
