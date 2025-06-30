import type React from "react";

interface LayoutContainerProps {
  children: React.ReactNode;
}

export const LayoutContainer: React.FC<LayoutContainerProps> = ({
  children,
}) => {
  return (
    <div
      className="relative flex min-h-screen flex-col bg-gray-50 overflow-x-hidden"
      style={{
        width: "100%",
        height: "100%",
        fontFamily: "var(--font-family)",
      }}
    >
      <div className="flex h-full flex-col" style={{ flexGrow: 1 }}>
        {children}
      </div>
    </div>
  );
};
