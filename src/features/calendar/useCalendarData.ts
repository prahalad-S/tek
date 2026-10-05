import { companyHolidays } from "../../lib/companyHolidays";
import { previewCalendar } from "./previewCalendar";
import { useQuery } from "@tanstack/react-query";
import { client } from "../../lib/supabase";
import { rpc, projects } from "../../lib/api";
import {
  previewEntries,
  previewProjects,
  previewEmployees,
} from "../../lib/preview";
import { dateKey } from "../../lib/domain";
import { directoryPeople } from "../../lib/profiles";
import { addDays, type CalendarEntry, type CalendarLeave } from "./domain";
export function useCalendarData(
  from: string,
  to: string,
  preview: boolean,
  user: string,
) {
  const entries = useQuery({
    queryKey: ["calendar-entries", from, to, preview],
    queryFn: async () => {
      if (preview)
        return previewCalendar(user).entries.filter(
          (e) => e.work_date >= from && e.work_date <= to,
        );
      const rows: CalendarEntry[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client()
          .from("time_entries")
          .select("*,projects(name),timesheets!inner(user_id,status)")
          .gte("work_date", from)
          .lte("work_date", to)
          .order("work_date")
          .order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data as any));
        if (data.length < 500) break;
      }
      return rows;
    },
  });
  const leave = useQuery({
    queryKey: ["calendar-leave", from, to, preview],
    queryFn: async () => {
      if (preview)
        return previewCalendar(user).leave.filter(
          (l) => l.from_date <= to && l.to_date >= from,
        );
      const rows: CalendarLeave[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client()
          .from("leave_requests")
          .select("*")
          .lte("from_date", to)
          .gte("to_date", from)
          .order("from_date")
          .order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data as CalendarLeave[]));
        if (data.length < 500) break;
      }
      return rows;
    },
  });
  const shared = useQuery({
    queryKey: ["calendar-shared", from, to, preview],
    queryFn: async () => {
      if (preview)
        return {
          events: [],
          holidays: companyHolidays.filter((h) => h.day >= from && h.day <= to),
        };
      const [e, h] = await Promise.all([
        client()
          .from("events")
          .select("*")
          .lt("starts_at", new Date(`${addDays(to, 1)}T00:00:00`).toISOString())
          .gte("ends_at", new Date(`${from}T00:00:00`).toISOString())
          .order("starts_at")
          .limit(1000),
        client()
          .from("holidays")
          .select("*")
          .gte("day", from)
          .lte("day", to)
          .order("day")
          .limit(1000),
      ]);
      if (e.error) throw e.error;
      if (h.error) throw h.error;
      return { events: e.data, holidays: h.data };
    },
  });
  const birthdays = useQuery({
    queryKey: ["calendar-birthdays", from.slice(0, 4), to.slice(0, 4), preview],
    queryFn: async () => {
      if (preview)
        return [
          {
            user_id: "preview",
            full_name: "Alex Morgan",
            birthday: dateKey(new Date()),
          },
        ];
      const years = [
        ...new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]),
      ];
      return (
        await Promise.all(
          years.map((year) =>
            rpc<{ user_id: string; full_name: string; birthday: string }[]>(
              "calendar_birthdays",
              { p_year: year },
            ),
          ),
        )
      ).flat();
    },
  });
  const access = useQuery({
    queryKey: ["calendar-access", preview],
    refetchInterval: 30000,
    queryFn: () =>
      preview
        ? Promise.resolve({
            today: dateKey(new Date()),
            earliest: addDays(dateKey(new Date()), -1),
            timezone: "Asia/Kolkata",
            grants: [],
          })
        : rpc<{
            today: string;
            earliest: string;
            timezone: string;
            grants: { from_date: string; to_date: string }[];
          }>("calendar_access"),
  });
  const people = useQuery({
    queryKey: ["directory-all", preview],
    queryFn: () =>
      preview ? Promise.resolve(previewEmployees) : directoryPeople(),
  });
  const project = useQuery({
    queryKey: ["projects", preview],
    queryFn: () => (preview ? Promise.resolve(previewProjects) : projects()),
  });
  return { entries, leave, shared, access, people, project, birthdays };
}
