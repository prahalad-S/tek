import type { CSSProperties } from "react";

export function BirthdayIcon({
  size = 14,
  className = "",
  style,
  strokeWidth = 1.8,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Base Plate */}
      <path d="M2.5 21.5H21.5" />

      {/* Cake Main Body */}
      <path d="M4.5 11.5H19.5V19.5C19.5 20.3 18.8 21 18 21H6C5.2 21 4.5 20.3 4.5 19.5V11.5Z" />

      {/* Wavy Icing / Frosting Drip */}
      <path d="M4.5 14.5C5.3 14.5 5.8 15.5 6.5 15.5C7.2 15.5 7.8 14.5 8.5 14.5C9.2 14.5 9.8 15.5 10.5 15.5C11.2 15.5 11.8 14.5 12.5 14.5C13.2 14.5 13.8 15.5 14.5 15.5C15.2 15.5 15.8 14.5 16.5 14.5C17.2 14.5 17.8 15.5 18.5 15.5C19 15.5 19.3 15 19.5 14.5" />

      {/* Candles */}
      <line x1="8" y1="7" x2="8" y2="11.5" />
      <line x1="12" y1="5.5" x2="12" y2="11.5" />
      <line x1="16" y1="7" x2="16" y2="11.5" />

      {/* Candle Flames */}
      <path d="M8 3.5C7.4 4.3 7.4 5.2 8 5.7C8.6 5.2 8.6 4.3 8 3.5Z" />
      <path d="M12 2C11.4 2.8 11.4 3.7 12 4.2C12.6 3.7 12.6 2.8 12 2Z" />
      <path d="M16 3.5C15.4 4.3 15.4 5.2 16 5.7C16.6 5.2 16.6 4.3 16 3.5Z" />
    </svg>
  );
}

export default BirthdayIcon;
