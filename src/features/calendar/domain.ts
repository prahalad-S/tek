import { dateKey, weekStart, weekDays } from "../../lib/domain";
export type CalendarView = "day" | "week" | "month" | "year";
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}
export function calendarRange(anchor: string, view: CalendarView) {
  const d = new Date(`${anchor}T12:00:00`);
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "year")
    return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
  if (view === "week") {
    const days = weekDays(weekStart(d));
    return { from: days[0], to: days[6] };
  }
  const first = dateKey(new Date(d.getFullYear(), d.getMonth(), 1));
  const last = dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  return {
    from: weekStart(new Date(`${first}T12:00:00`)),
    to: addDays(weekStart(new Date(`${last}T12:00:00`)), 6),
  };
}
export function rangeDays(from: string, to: string) {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days.push(d);
    if (days.length > 740) throw new Error("Date range is too long.");
  }
  return days;
}
export function shiftAnchor(anchor: string, view: CalendarView, delta: number) {
  const d = new Date(`${anchor}T12:00:00`);
  if (view === "year") d.setFullYear(d.getFullYear() + delta, 0, 1);
  else if (view === "month") d.setMonth(d.getMonth() + delta, 1);
  else d.setDate(d.getDate() + delta * (view === "day" ? 1 : 7));
  return dateKey(d);
}
export type CalendarEntry = {
  id: string;
  timesheet_id: string;
  calendar_span_id?: string | null;
  calendar_span_start?: string | null;
  work_date: string;
  project_id: string;
  description: string;
  minutes: number;
  version: number;
  task_status: string;
  projects?: { name: string };
  timesheets: { user_id: string; status: string };
};
export type CalendarLeave = {
  id: string;
  user_id: string;
  from_date: string;
  to_date: string;
  reason: string;
  leave_type: string;
  daily_minutes: number;
  status: string;
  version: number;
};

export const ENTRY_COLORS = [
  "#7656e8",
  "#dc4f83",
  "#258fbe",
  "#268f78",
  "#be7426",
];

export function getEntryColor(projectId?: string) {
  if (!projectId) return ENTRY_COLORS[0];
  const hash = Array.from(projectId).reduce((a, c) => a + c.charCodeAt(0), 0);
  return ENTRY_COLORS[hash % ENTRY_COLORS.length];
}

