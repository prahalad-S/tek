import { useState } from "react";
export default function HoursInput({ initial = 1 }: { initial?: number }) {
  const [value, setValue] = useState(String(initial));
  const num = Number(value);
  return (
    <div className="hours-control">
      <label>
        Hours preset
        <select
          aria-label="Hours preset"
          value={
            Number.isInteger(num) && num >= 1 && num <= 8
              ? String(num)
              : num >= 9
                ? "9+"
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
          <option value="9+">9+ hours</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <label>
        Hours
        <input
          name="hours"
          type="number"
          min="0.25"
          max="24"
          step="0.25"
          value={value}
          required
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
    </div>
  );
}
