import type React from "react";

interface MainContentProps {
  children: React.ReactNode;
}

export const MainContent: React.FC<MainContentProps> = ({ children }) => {
  return (
    <div className="gap-1 px-6 flex flex-1 justify-center py-5">{children}</div>
  );
};
