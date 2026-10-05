import { client } from "./supabase";
import { previewEmployees } from "./preview";
import { weekStart } from "./domain";
export type HistoryRow = {
  id: string;
  sheet_id: string | null;
  user_id: string;
  employee_name: string;
  week_start: string;
  status: string;
  review_note: string;
  time_entries: { minutes: number }[];
  activities: {
    id: string;
    action: string;
    actor_name: string;
    created_at: string;
  }[];
};
export async function workHistory(preview: boolean): Promise<HistoryRow[]> {
  if (preview)
    return [
      {
        id: "preview-history",
        sheet_id: null,
        user_id: "preview",
        employee_name: previewEmployees[0].full_name,
        week_start: weekStart(),
        status: "draft",
        review_note: "",
        time_entries: [{ minutes: 240 }],
        activities: [
          {
            id: "sample-action",
            action: "Moved entry to another date",
            actor_name: previewEmployees[0].full_name,
            created_at: new Date().toISOString(),
          },
        ],
      },
    ];
  const db = client();
  const [s, a, h, ah] = await Promise.all([
    db
      .from("timesheets")
      .select("*,time_entries(minutes)")
      .order("week_start", { ascending: false })
      .limit(100),
    db
      .from("workspace_activity")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    db.from("history_hidden").select("timesheet_id"),
    db.from("activity_hidden").select("activity_id"),
  ]);
  for (const r of [s, a, h, ah]) if (r.error) throw r.error;
  const acts = a.data!.filter(
    (x) => !ah.data!.some((h) => h.activity_id === x.id),
  );
  const users = [
    ...new Set([
      ...s.data!.map((x) => x.user_id),
      ...acts.flatMap((x) => [x.user_id, x.actor]).filter(Boolean),
    ]),
  ];
  if (!users.length) return [];
  const p = await db
    .from("employees")
    .select("user_id,full_name")
    .in("user_id", users);
  if (p.error) throw p.error;
  const name = (id: string | null) =>
    id
      ? p.data.find((p) => p.user_id === id)?.full_name || "Workspace member"
      : "Automatic action";
  const grouped = (user: string, week: string) =>
    acts
      .filter((x) => x.user_id === user && x.week_start === week)
      .map((x) => ({ ...x, actor_name: name(x.actor) }));
  const rows: HistoryRow[] = s
    .data!.filter((x) => !h.data!.some((h) => h.timesheet_id === x.id))
    .map((x) => ({
      ...x,
      sheet_id: x.id,
      employee_name: name(x.user_id),
      activities: grouped(x.user_id, x.week_start),
    }));
  for (const a of acts) {
    if (
      s.data!.some(
        (s) => s.user_id === a.user_id && s.week_start === a.week_start,
      ) ||
      rows.some((s) => s.user_id === a.user_id && s.week_start === a.week_start)
    )
      continue;
    rows.push({
      id: `activity-${a.user_id}-${a.week_start}`,
      sheet_id: null,
      user_id: a.user_id,
      employee_name: name(a.user_id),
      week_start: a.week_start,
      status: "activity",
      review_note: "",
      time_entries: [],
      activities: grouped(a.user_id, a.week_start),
    });
  }
  return rows.sort((a, b) => b.week_start.localeCompare(a.week_start));
}
