import type React from "react";

interface InputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "email";
  required?: boolean;
  className?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  required = false,
  className = "",
}) => {
  const inputStyles = {
    display: "flex",
    width: "100%",
    minWidth: "0",
    flex: "1 1 0%",
    resize: "none" as const,
    overflow: "hidden",
    borderRadius: "0.75rem",
    color: "var(--foreground)",
    border: "1px solid var(--border-dashed)",
    backgroundColor: "#f9fafb",
    height: "3.5rem",
    padding: "15px",
    fontSize: "1rem",
    fontWeight: "400",
    fontFamily: "inherit",
  };

  return (
    <label className={`flex flex-col min-w-40 flex-1 ${className}`}>
      <p
        className="text-base font-medium pb-2"
        style={{ color: "var(--foreground)" }}
      >
        {label}
        {required && <span style={{ color: "red" }}>*</span>}
      </p>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={inputStyles}
        className="focus-outline-0"
      />
      <style jsx>{`
        input::placeholder {
          color: var(--muted-foreground);
        }
        input:focus {
          outline: 0;
          border-color: var(--border-dashed);
        }
      `}</style>
    </label>
  );
};
