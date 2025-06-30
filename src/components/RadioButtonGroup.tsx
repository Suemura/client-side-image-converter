import type React from "react";

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
    <div className="flex gap-3 p-4" style={{ flexWrap: "wrap" }}>
      {options.map((option) => (
        <label
          key={option.value}
          className="cursor-pointer relative"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "0.75rem",
            border:
              selectedValue === option.value
                ? "3px solid var(--primary)"
                : "1px solid var(--border-dashed)",
            padding: selectedValue === option.value ? "0 0.875rem" : "0 1rem",
            height: "2.75rem",
            color: "var(--foreground)",
            fontSize: "0.875rem",
            fontWeight: "500",
          }}
        >
          {option.label}
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={selectedValue === option.value}
            onChange={(e) => onChange(e.target.value)}
            style={{
              position: "absolute",
              visibility: "hidden",
            }}
          />
        </label>
      ))}
    </div>
  );
};
