import {
  CalendarDays,
  Clock3,
  BriefcaseBusiness,
  CircleCheck,
  Pencil,
  Trash2,
} from "lucide-react";
import { Avatar, Badge } from "../../components/ui";
import { minutesLabel } from "../../lib/domain";
import type { Employee } from "../../lib/types";
import type { CalendarEntry } from "./domain";
export default function TimeEntryDetails({
  entry,
  employee,
  editable,
  sample,
  onClose,
  onEdit,
  onDelete,
}: {
  entry: CalendarEntry;
  employee?: Employee;
  editable: boolean;
  sample: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const date = new Date(entry.work_date + "T12:00:00");
  return (
    <div className="time-detail">
      <div className="time-detail-status">
        <Badge>{entry.timesheets.status}</Badge>
      </div>
      <label className="time-detail-label">Employee</label>
      <div className="time-detail-person">
        <Avatar
          person={employee || { full_name: "Team member", avatar_path: null }}
        />
        <div>
          <strong>{employee?.full_name || "Team member"}</strong>
          {employee?.title && <Badge tone="purple">{employee.title}</Badge>}
          <small>Emp ID: {employee?.employee_code || "Not added"}</small>
        </div>
        <span>{employee?.departments?.name || ""}</span>
      </div>
      <div className="time-detail-grid">
        <article>
          <label>
            Date <CalendarDays size={15} />
          </label>
          <strong>
            {date.toLocaleDateString("en-US", {
              month: "short",
              day: "2-digit",
              year: "numeric",
            })}
          </strong>
          <small>{date.toLocaleDateString("en-US", { weekday: "long" })}</small>
        </article>
        <article>
          <label>
            Duration <Clock3 size={15} />
          </label>
          <strong>{minutesLabel(entry.minutes)}</strong>
          <small>{entry.minutes} minutes recorded</small>
        </article>
        <article>
          <label>
            Project <BriefcaseBusiness size={15} />
          </label>
          <strong>{entry.projects?.name || "No project"}</strong>
        </article>
        <article>
          <label>
            Task status <CircleCheck size={15} />
          </label>
          <Badge tone={entry.task_status === "Completed" ? "green" : "purple"}>
            {entry.task_status}
          </Badge>
        </article>
      </div>
      <label className="time-detail-label">
        Work performed <span>Description</span>
      </label>
      <div className="time-detail-description">{entry.description}</div>
      <div className="time-detail-record">
        <span>Timesheet record status</span>
        <Badge>{entry.timesheets.status}</Badge>
      </div>
      {sample && (
        <p className="muted">
          Fictional test entry. Not saved to the database.
        </p>
      )}
      <footer>
        <button
          className="button ghost"
          disabled={!editable || sample}
          onClick={onDelete}
        >
          <Trash2 size={14} />
          Delete
        </button>
        <span />
        <button className="button secondary" onClick={onClose}>
          Close
        </button>
        <button
          className="button"
          disabled={!editable || sample}
          onClick={onEdit}
        >
          <Pencil size={15} />
          Edit entry
        </button>
      </footer>
    </div>
  );
}
