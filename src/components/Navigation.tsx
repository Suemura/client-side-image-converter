import Link from "next/link";
import type React from "react";

export const Navigation: React.FC = () => {
  const navItems = [
    { label: "Top", href: "/" },
    { label: "Crop", href: "/crop" },
    { label: "Convert", href: "/convert" },
  ];

  return (
    <nav className="flex items-center gap-9">
      {navItems.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="text-sm font-medium"
          style={{ color: "var(--foreground)" }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
};
