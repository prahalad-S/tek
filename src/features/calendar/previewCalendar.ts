import { previewWork, previewProjects } from "../../lib/preview";
import { dateKey } from "../../lib/domain";
import {
  addDays,
  rangeDays,
  type CalendarEntry,
  type CalendarLeave,
} from "./domain";
let state: { entries: CalendarEntry[]; leave: CalendarLeave[] } | null = null;
const history: { entries: CalendarEntry[]; leave: CalendarLeave[] }[] = [];
function current(user: string) {
  if (!state)
    state = {
      entries: structuredClone(previewWork) as CalendarEntry[],
      leave: [],
    };
  return state;
}
export function previewCalendar(user: string) {
  return structuredClone(current(user));
}
export function previewCalendarCommand(
  name: string,
  p: Record<string, any>,
  user: string,
) {
  const data = current(user);
  if (name === "undo_calendar_change") {
    const previous = history.pop();
    if (!previous) throw Error("No calendar change to undo yet.");
    state = previous;
    return;
  }
  const next = structuredClone(data);
  if (name === "resize_calendar_entry") {
    const entry = next.entries.find(e => e.id === p.p_id);
    if (!entry || entry.version !== p.p_version) throw Error("Entry changed. Refresh and retry.");
    const from = entry.calendar_span_start || entry.work_date;
    if(p.p_date < from || rangeDays(from,p.p_date).length > 32 || p.p_minutes < 60 || p.p_minutes > 480 || p.p_minutes % 60) throw Error("Choose 1 to 8 hours per day.");
    const span = entry.calendar_span_id || crypto.randomUUID();
    const old = next.entries.filter(e => e.id === entry.id || e.calendar_span_id === span);
    if(old.some(e => !["draft","rejected"].includes(e.timesheets.status))) throw Error("Timesheet is locked for review.");
    next.entries = next.entries.filter(e => !old.includes(e));
    for(const date of rangeDays(from,p.p_date)) {
      const previous = old.find(e => e.work_date === date);
      next.entries.push({...entry,id:previous?.id || crypto.randomUUID(),work_date:date,minutes:date === p.p_date ? p.p_minutes : 480,version:(previous?.version || 0)+1,calendar_span_id:span,calendar_span_start:from});
    }
  } else if (name === "save_calendar_entry") {
    const old = next.entries.find((e) => e.id === p.p_id);
    const entry = {
      ...old,
      id: p.p_id || crypto.randomUUID(),
      timesheet_id: old?.timesheet_id || "preview",
      work_date: p.p_date,
      project_id: p.p_project,
      description: p.p_description,
      minutes: p.p_minutes,
      task_status: p.p_status,
      version: (old?.version || 0) + 1,
      projects: {
        name:
          previewProjects.find((x) => x.id === p.p_project)?.name || "Project",
      },
      timesheets: { user_id: p.p_user || user, status: "draft" },
    } as CalendarEntry;
    next.entries = next.entries.filter((e) => e.id !== entry.id);
    next.entries.push(entry);
  } else if (name === "calendar_entry_action") {
    const entry = next.entries.find((e) => e.id === p.p_id);
    if (!entry) throw Error("Entry no longer exists.");
    if (p.p_action === "delete")
      next.entries = next.entries.filter((e) => e.id !== entry.id);
    else if (p.p_action === "move") {
      entry.work_date = p.p_date;
      entry.version++;
    } else if (p.p_action === "copy")
      next.entries.push({
        ...entry,
        id: crypto.randomUUID(),
        work_date: p.p_date,
        version: 1,
      });
    else if (p.p_action === "extend") {
      if (
        p.p_date <= entry.work_date ||
        rangeDays(entry.work_date, p.p_date).length > 32
      )
        throw Error("Choose a later date within 31 days.");
      for (const d of rangeDays(addDays(entry.work_date, 1), p.p_date))
        next.entries.push({
          ...entry,
          id: crypto.randomUUID(),
          work_date: d,
          version: 1,
        });
    }
  } else if (name === "save_calendar_leave") {
    next.leave = next.leave.filter((l) => l.id !== p.p_id);
    next.leave.push({
      id: p.p_id || crypto.randomUUID(),
      user_id: p.p_user || user,
      from_date: p.p_from,
      to_date: p.p_to,
      reason: p.p_reason,
      leave_type: p.p_type,
      daily_minutes: p.p_minutes,
      status: "pending",
      version: 1,
    } as CalendarLeave);
  } else if (name === "delete_calendar_leave") {
    next.leave = next.leave.filter((l) => l.id !== p.p_id);
  } else if (name === "calendar_leave_action") {
    const l = next.leave.find((l) => l.id === p.p_id);
    if (!l) throw Error("Leave no longer exists.");
    if (p.p_action === "extend") l.to_date = p.p_date;
    else {
      const days = rangeDays(l.from_date, l.to_date).length - 1;
      const updated = {
        ...l,
        from_date: p.p_date,
        to_date: addDays(p.p_date, days),
        version: l.version + 1,
      };
      if (p.p_action === "copy")
        next.leave.push({ ...updated, id: crypto.randomUUID(), version: 1 });
      else Object.assign(l, updated);
    }
  }
  for (const e of next.entries) {
    if (
      next.entries
        .filter(
          (r) =>
            r.work_date === e.work_date &&
            r.timesheets.user_id === e.timesheets.user_id,
        )
        .reduce((n, r) => n + r.minutes, 0) > 480
    )
      throw Error("Work cannot exceed 8 hours per day.");
  }
  history.push(structuredClone(data));
  if (history.length > 50) history.shift();
  state = next;
}
