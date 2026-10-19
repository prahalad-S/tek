import { useState } from "react";
export default function HoursInput({ initial = 1, precise = false, readOnly = false }: { initial?: number; precise?: boolean; readOnly?: boolean }) {
  const [value, setValue] = useState(String(initial));
  const num = Number(value);
  return (
    <div className="hours-control">
      <label>
        Hours preset
        <select
          aria-label="Hours preset"
          disabled={readOnly}
          value={
            Number.isInteger(num) && num >= 1 && num <= 8
              ? String(num)
              : "custom"
          }
          onChange={(e) => {
            if (e.target.value !== "custom")
              setValue(e.target.value === "9+" ? "9" : e.target.value);
          }}
        >
          {Array.from({ length: 8 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1} {i === 0 ? "hour" : "hours"}
            </option>
          ))}

          <option value="custom">Custom</option>
        </select>
      </label>
      <label>
        Hours
        <input
          name="hours"
          type="number"
          min={precise ? 1 / 60 : 0.25}
          max="8"
          step={precise ? "any" : "0.25"}
          readOnly={readOnly}
          value={value}
          required
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
    </div>
  );
}
