import type React from "react";
import styles from "./Input.module.css";

interface InputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "email";
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  required = false,
  disabled = false,
  className = "",
}) => {

  return (
    <label className={`${styles.container} ${className}`}>
      <p className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </p>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={styles.input}
      />
    </label>
  );
};
