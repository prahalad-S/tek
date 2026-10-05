import { useState } from "react";
import { Modal, useToast } from "../../components/ui";
import { useCalendarData } from "./useCalendarData";
import { downloadCsv, errorMessage } from "../../lib/domain";
import { rangeDays } from "./domain";
export default function CalendarExport({
  from,
  to,
  preview,
  user,
  onClose,
}: {
  from: string;
  to: string;
  preview: boolean;
  user: string;
  onClose: () => void;
}) {
  const [start, setStart] = useState(from),
    [end, setEnd] = useState(to),
    [kind, setKind] = useState("all"),
    [project, setProject] = useState("");
  const valid =
    !!start &&
    !!end &&
    end >= start &&
    (Date.parse(end) - Date.parse(start)) / 86400000 < 366;
  const data = useCalendarData(
    valid ? start : from,
    valid ? end : to,
    preview,
    user,
  );
  const toast = useToast();
  const busy = data.entries.isFetching || data.leave.isFetching;
  return (
    <Modal
      open
      onClose={onClose}
      title="Export calendar"
      description="Choose a date range and the entries to include. Durations are exported in hours."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const error = data.entries.error || data.leave.error;
          if (error) {
            toast(errorMessage(error), "error");
            return;
          }
          if (!valid) {
            toast("Choose a date range of up to one year.", "error");
            return;
          }
          const name = (id: string) =>
            data.people.data?.find((p) => p.user_id === id)?.full_name ||
            "Team member";
          const rows: any[][] = [
            [
              "Type",
              "Employee",
              "Date",
              "Project / leave type",
              "Description",
              "Hours",
              "Status",
            ],
          ];
          if (kind !== "leave")
            for (const r of data.entries.data || [])
              if (
                (!user || r.timesheets.user_id === user) &&
                (!project || r.project_id === project) &&
                r.work_date >= start &&
                r.work_date <= end
              )
                rows.push([
                  "Work",
                  name(r.timesheets.user_id),
                  r.work_date,
                  r.projects?.name || "",
                  r.description,
                  r.minutes / 60,
                  r.task_status,
                ]);
          if (kind !== "work" && !project)
            for (const l of data.leave.data || [])
              if (!user || l.user_id === user)
                for (const d of rangeDays(
                  l.from_date > start ? l.from_date : start,
                  l.to_date < end ? l.to_date : end,
                ))
                  rows.push([
                    "Leave",
                    name(l.user_id),
                    d,
                    l.leave_type,
                    l.reason,
                    l.daily_minutes / 60,
                    l.status,
                  ]);
          downloadCsv("Tekzenit-calendar.csv", rows);
          toast("Calendar exported in hours.");
          onClose();
        }}
      >
        <div className="form-grid">
          <label>
            From date
            <input
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            To date
            <input
              type="date"
              required
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <label>
          Entry type
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              if (e.target.value === "leave") setProject("");
            }}
          >
            <option value="all">Work and leave</option>
            <option value="work">Work</option>
            <option value="leave">Leave</option>
          </select>
        </label>
        <label>
          Project
          <select
            disabled={kind === "leave"}
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="">All Projects</option>
            {data.project.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button" disabled={busy || !valid}>
          {busy ? "Loading entries…" : "Export CSV"}
        </button>
      </form>
    </Modal>
  );
}
