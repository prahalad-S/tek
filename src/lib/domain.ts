export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function weekStart(date = new Date()): string {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey(d);
}
export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${start}T12:00:00`);
    d.setDate(d.getDate() + i);
    return dateKey(d);
  });
}
export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((x) => x[0])
      .join("")
      .toUpperCase() || "?"
  );
}
export function minutesLabel(minutes: number): string {
  return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}
export function parseMinutes(hours: string): number {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0 || n > 24 || !Number.isInteger(n * 60))
    throw new Error("Enter a duration between 1 minute and 24 hours.");
  return n * 60;
}
export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "Something went wrong. Please try again.";
}
export function downloadCsv(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
