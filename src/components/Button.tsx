import type React from "react";

interface ButtonProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  size?: "small" | "medium" | "large";
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "medium",
  onClick,
  type = "button",
  disabled = false,
  className = "",
}) => {
  const baseStyles = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: "0.75rem",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: "700",
    letterSpacing: "0.015em",
    border: "none",
    fontFamily: "inherit",
  };

  const variantStyles = {
    primary: {
      backgroundColor: "var(--primary)",
      color: "var(--foreground)",
    },
    secondary: {
      backgroundColor: "transparent",
      color: "var(--foreground)",
      border: "1px solid var(--border-dashed)",
    },
  };

  const sizeStyles = {
    small: {
      height: "2rem",
      padding: "0 0.75rem",
      fontSize: "0.75rem",
      minWidth: "60px",
      maxWidth: "320px",
    },
    medium: {
      height: "2.5rem",
      padding: "0 1rem",
      fontSize: "0.875rem",
      minWidth: "84px",
      maxWidth: "480px",
    },
    large: {
      height: "3rem",
      padding: "0 1.5rem",
      fontSize: "1rem",
      minWidth: "100px",
      maxWidth: "600px",
    },
  };

  const styles = {
    ...baseStyles,
    ...variantStyles[variant],
    ...sizeStyles[size],
    opacity: disabled ? 0.6 : 1,
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={styles}
      className={className}
    >
      <span className="truncate">{children}</span>
    </button>
  );
};
