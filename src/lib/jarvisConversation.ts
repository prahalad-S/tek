import { dateKey } from "./domain";
export function jarvisDate(text: string): string | null {
  const value = text.toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/g, "$1").trim();
  const today = new Date();
  if (/\b(today|till date|to date)\b/.test(value)) return dateKey(today);
  if (/\byesterday\b/.test(value)) { today.setDate(today.getDate() - 1); return dateKey(today); }
  const iso = value.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) {
    const d = new Date(iso[1] + "T12:00:00");
    return !isNaN(d.getTime()) && dateKey(d) === iso[1] ? iso[1] : null;
  }
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const day = days.findIndex(d => new RegExp(`\\b${d}\\b`).test(value));
  if (day >= 0) {
    let diff = day - today.getDay();
    if (/\bnext\b/.test(value)) { if (diff <= 0) diff += 7; }
    else if (diff > 0 || (/\blast\b/.test(value) && diff === 0)) diff -= 7;
    today.setDate(today.getDate() + diff); return dateKey(today);
  }
  const months = "january february march april may june july august september october november december".split(" ");
  const m = value.match(new RegExp(`\\b(${months.join("|")})\\s+(\\d{1,2})(?:\\s*,?\\s*(\\d{4}))?\\b`));
  if (m) {
    const year = Number(m[3] || today.getFullYear()), month = months.indexOf(m[1]), day = Number(m[2]);
    const d = new Date(year, month, day, 12);
    return d.getMonth() === month && d.getDate() === day ? dateKey(d) : null;
  }
  return null;
}
export function spokenHours(text: string): number | null {
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, half: 0.5 };
  const match = text.toLowerCase().match(/\b(?:time\s+(?:is\s+)?|hours?\s+)(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half)\b|\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half)\s+hours?\b/);
  if (!match) return null;
  const v = match[1] || match[2]; const n = words[v] ?? Number(v);
  return n > 0 && n <= 24 ? n : null;
}
