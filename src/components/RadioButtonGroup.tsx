import type React from "react";
import styles from "./RadioButtonGroup.module.css";

interface RadioButtonOption {
  label: string;
  value: string;
}

interface RadioButtonGroupProps {
  name: string;
  options: RadioButtonOption[];
  selectedValue: string;
  onChange: (value: string) => void;
}

export const RadioButtonGroup: React.FC<RadioButtonGroupProps> = ({
  name,
  options,
  selectedValue,
  onChange,
}) => {
  return (
    <div className={styles.group}>
      {options.map((option) => (
        <label
          key={option.value}
          className={
            selectedValue === option.value
              ? `${styles.option} ${styles.optionSelected}`
              : styles.option
          }
        >
          {option.label}
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={selectedValue === option.value}
            onChange={(e) => onChange(e.target.value)}
            className={styles.input}
          />
        </label>
      ))}
    </div>
  );
};
