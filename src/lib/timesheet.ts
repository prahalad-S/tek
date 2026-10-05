import { client } from "./supabase.ts";
import { weekStart } from "./domain.ts";
import type { Entry, Timesheet } from "./types.ts";

async function command<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  return data as T;
}

export type TimesheetStatus = Timesheet["status"];

/** Weekly and calendar work UIs share this rule. Leave/events/holidays do not. */
export function timesheetAllowsEdits(status?: string | null) {
  return !status || status === "draft" || status === "rejected";
}

export function timesheetAllowsSubmit(
  status?: string | null,
  hasEntries = false,
) {
  return hasEntries && (status === "draft" || status === "rejected");
}

function assertWorkEditable(status?: string | null) {
  if (timesheetAllowsEdits(status)) return;
  throw new Error(
    status === "submitted"
      ? "This timesheet is locked while it is waiting for review."
      : "This timesheet is approved and locked.",
  );
}

export async function getOrCreateTimesheet(week: string) {
  return command<Timesheet>("get_or_create_timesheet", { p_week: week });
}

export async function listTimesheetEntries(sheetId: string): Promise<Entry[]> {
  const { data, error } = await client()
    .from("time_entries")
    .select("*, projects(name)")
    .eq("timesheet_id", sheetId)
    .order("work_date");
  if (error) throw error;
  return data;
}

export async function timesheetStatusForWeek(userId: string, workDate: string) {
  const week = weekStart(new Date(`${workDate}T12:00:00`));
  const { data, error } = await client()
    .from("timesheets")
    .select("status")
    .eq("user_id", userId)
    .eq("week_start", week)
    .maybeSingle();
  if (error) throw error;
  return (data?.status as TimesheetStatus | undefined) ?? null;
}

export async function saveOwnTimeEntry(input: {
  sheetId: string;
  date: string;
  projectId: string;
  description: string;
  minutes: number;
  entryId?: string | null;
  version?: number | null;
  sheetStatus?: string | null;
}) {
  assertWorkEditable(input.sheetStatus);
  return command<string>("save_time_entry", {
    p_sheet: input.sheetId,
    p_date: input.date,
    p_project: input.projectId,
    p_description: input.description,
    p_minutes: input.minutes,
    p_id: input.entryId ?? null,
    p_version: input.version ?? null,
  });
}

export async function saveCalendarWorkEntry(input: {
  userId: string;
  date: string;
  projectId: string;
  description: string;
  minutes: number;
  taskStatus?: string;
  entryId?: string | null;
  version?: number | null;
  sheetStatus?: string | null;
}) {
  const status =
    input.sheetStatus ??
    (await timesheetStatusForWeek(input.userId, input.date));
  assertWorkEditable(status);
  return command<string>("save_calendar_entry", {
    p_user: input.userId,
    p_date: input.date,
    p_project: input.projectId,
    p_description: input.description,
    p_minutes: input.minutes,
    p_status: input.taskStatus || "In Progress",
    p_id: input.entryId ?? null,
    p_version: input.version ?? null,
  });
}

export async function deleteOwnTimeEntry(input: {
  id: string;
  version: number;
  sheetStatus?: string | null;
}) {
  assertWorkEditable(input.sheetStatus);
  return command("delete_time_entry", { p_id: input.id, p_version: input.version });
}

export async function applyCalendarWorkAction(input: {
  id: string;
  version: number;
  action: string;
  date?: string | null;
  sheetStatus?: string | null;
}) {
  assertWorkEditable(input.sheetStatus);
  return command("calendar_entry_action", {
    p_id: input.id,
    p_version: input.version,
    p_action: input.action,
    p_date: input.date ?? null,
  });
}

export async function submitTimesheet(input: {
  id: string;
  version: number;
  status?: string | null;
  hasEntries?: boolean;
}) {
  if (!timesheetAllowsSubmit(input.status, input.hasEntries ?? true)) {
    throw new Error("This timesheet cannot be submitted.");
  }
  return command("submit_timesheet", { p_id: input.id, p_version: input.version });
}

export async function reviewTimesheet(input: {
  id: string;
  version: number;
  approve: boolean;
  note?: string;
}) {
  return command("review_timesheet", {
    p_id: input.id,
    p_version: input.version,
    p_approve: input.approve,
    p_note: input.note || "",
  });
}
