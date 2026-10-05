import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { X, Plus, Clock3 } from "lucide-react";
import { minutesLabel, downloadCsv } from "../../lib/domain";
import type { CalendarEntry, CalendarLeave } from "./domain";

export default function DayEntriesModal({
  open,
  date,
  entries,
  leaves,
  getName,
  onClose,
  onAddEntry,
  onViewEntry,
  onDeleteEntry,
  onViewLeave,
  onDeleteLeave,
}: {
  open: boolean;
  date: string | null;
  entries: CalendarEntry[];
  leaves: CalendarLeave[];
  getName: (userId: string) => string;
  onClose: () => void;
  onAddEntry: () => void;
  onViewEntry: (entry: CalendarEntry) => void;
  onDeleteEntry: (entry: CalendarEntry) => void;
  onViewLeave: (leave: CalendarLeave) => void;
  onDeleteLeave: (leave: CalendarLeave) => void;
}) {
  const [filter, setFilter] = useState<"all" | "work" | "leave">("all");

  if (!date) return null;

  const dateObj = new Date(date + "T12:00:00");
  const weekday = dateObj.toLocaleDateString("en-US", { weekday: "long" });

  const totalWorkMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);
  const totalLeaveMinutes = leaves.reduce((sum, l) => sum + l.daily_minutes, 0);
  const totalMinutes = totalWorkMinutes + totalLeaveMinutes;
  const totalHours = (totalMinutes / 60).toFixed(1);
  const totalCount = entries.length + leaves.length;

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || "TM";
  };

  const getAvatarHue = (str: string) => {
    return [...str].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 6;
  };

  const formatHours = (minutes: number) => {
    const h = minutes / 60;
    return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
  };

  const handleExport = () => {
    const headers = [
      "Date",
      "Employee",
      "Type",
      "Project / Reason",
      "Description / Details",
      "Duration",
      "Status",
    ];
    const workRows = entries.map((e) => [
      e.work_date,
      getName(e.timesheets.user_id),
      "Work",
      e.projects?.name || "No project",
      e.description,
      minutesLabel(e.minutes),
      e.task_status,
    ]);
    const leaveRows = leaves.map((l) => [
      `${l.from_date} to ${l.to_date}`,
      getName(l.user_id),
      "Leave",
      l.leave_type,
      l.reason || "—",
      minutesLabel(l.daily_minutes),
      l.status,
    ]);

    downloadCsv(`entries-${date}.csv`, [headers, ...workRows, ...leaveRows]);
  };

  const showWork = filter === "all" || filter === "work";
  const showLeave = filter === "all" || filter === "leave";

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="day-entries-modal" aria-describedby="day-modal-desc">
          {/* Fixed Header */}
          <div className="day-modal-header">
            <div className="day-modal-title-row">
              <div className="day-modal-title-wrap">
                <Dialog.Title className="day-modal-title">
                  Entries for {date}
                </Dialog.Title>
                <span className="day-modal-weekday-badge">{weekday}</span>
              </div>
              <Dialog.Close className="icon-button" aria-label="Close popup">
                <X size={20} />
              </Dialog.Close>
            </div>
            <p id="day-modal-desc" className="day-modal-subtitle">
              All recorded work and leave for this day.
            </p>

            {/* Filter Tabs & Add Action */}
            <div className="day-modal-action-bar">
              <div className="day-modal-filter-tabs">
                <button
                  type="button"
                  className={`day-modal-tab ${filter === "all" ? "active" : ""}`}
                  onClick={() => setFilter("all")}
                >
                  All ({totalCount})
                </button>
                <button
                  type="button"
                  className={`day-modal-tab ${filter === "work" ? "active" : ""}`}
                  onClick={() => setFilter("work")}
                >
                  Work ({entries.length})
                </button>
                <button
                  type="button"
                  className={`day-modal-tab ${filter === "leave" ? "active" : ""}`}
                  onClick={() => setFilter("leave")}
                >
                  Leave ({leaves.length})
                </button>
              </div>

              <button
                type="button"
                className="day-modal-add-btn"
                onClick={onAddEntry}
              >
                <Plus size={15} />
                Add work or leave
              </button>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="day-modal-body">
            {showWork &&
              entries.map((entry) => {
                const personName = getName(entry.timesheets.user_id);
                const hue = getAvatarHue(personName);
                const isCompleted =
                  entry.task_status.toLowerCase() === "completed";

                return (
                  <div className="day-entry-card" key={entry.id}>
                    {/* Top Row: Avatar + Title + Duration + Status */}
                    <div className="day-entry-top">
                      <div className="day-entry-left">
                        <span className={`day-entry-avatar day-avatar--${hue}`}>
                          {getInitials(personName)}
                        </span>
                        <strong className="day-entry-title" title={entry.description}>
                          {entry.description}
                        </strong>
                      </div>
                      <div className="day-entry-right">
                        <span className="day-entry-duration">
                          <Clock3 size={14} />
                          {formatHours(entry.minutes)}
                        </span>
                        <span
                          className={`day-entry-status ${
                            isCompleted ? "status--completed" : "status--in-progress"
                          }`}
                        >
                          <span
                            className={`day-status-dot ${
                              isCompleted ? "dot--green" : "dot--yellow"
                            }`}
                          />
                          {entry.task_status}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Row: Name + Project Tag + Actions */}
                    <div className="day-entry-bottom">
                      <div className="day-entry-meta">
                        <span className="day-entry-person">{personName}</span>
                        <span className="day-entry-sep">•</span>
                        <span className="day-entry-tag">
                          {entry.projects?.name || "No project"}
                        </span>
                      </div>
                      <div className="day-entry-actions">
                        <button
                          type="button"
                          className="day-btn-details"
                          onClick={() => onViewEntry(entry)}
                        >
                          View details
                        </button>
                        <button
                          type="button"
                          className="day-btn-delete"
                          onClick={() => onDeleteEntry(entry)}
                        >
                          Delete work
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

            {showLeave &&
              leaves.map((leave) => {
                const personName = getName(leave.user_id);
                const hue = getAvatarHue(personName);
                const isApproved = leave.status.toLowerCase() === "approved";

                return (
                  <div className="day-entry-card" key={leave.id}>
                    <div className="day-entry-top">
                      <div className="day-entry-left">
                        <span className={`day-entry-avatar day-avatar--${hue}`}>
                          {getInitials(personName)}
                        </span>
                        <strong className="day-entry-title">
                          [LEAVE] {leave.leave_type}
                        </strong>
                      </div>
                      <div className="day-entry-right">
                        <span className="day-entry-duration">
                          <Clock3 size={14} />
                          {formatHours(leave.daily_minutes)}
                        </span>
                        <span
                          className={`day-entry-status ${
                            isApproved ? "status--completed" : "status--in-progress"
                          }`}
                        >
                          <span
                            className={`day-status-dot ${
                              isApproved ? "dot--green" : "dot--yellow"
                            }`}
                          />
                          {leave.status}
                        </span>
                      </div>
                    </div>

                    <div className="day-entry-bottom">
                      <div className="day-entry-meta">
                        <span className="day-entry-person">{personName}</span>
                        <span className="day-entry-sep">•</span>
                        <span className="day-entry-tag">
                          {leave.reason || "Leave request"}
                        </span>
                      </div>
                      <div className="day-entry-actions">
                        <button
                          type="button"
                          className="day-btn-details"
                          onClick={() => onViewLeave(leave)}
                        >
                          Edit leave
                        </button>
                        <button
                          type="button"
                          className="day-btn-delete"
                          onClick={() => onDeleteLeave(leave)}
                        >
                          Delete leave
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

            {((showWork && entries.length === 0) || !showWork) &&
              ((showLeave && leaves.length === 0) || !showLeave) && (
                <div className="day-modal-empty">
                  <p>No entries found for the selected tab.</p>
                </div>
              )}
          </div>

          {/* Fixed Footer */}
          <div className="day-modal-footer">
            <div className="day-modal-footer-left">
              <span className="day-footer-dot" />
              <span>
                Total recorded: <strong>{totalHours} hrs</strong> across{" "}
                {totalCount} {totalCount === 1 ? "entry" : "entries"}
              </span>
            </div>
            <button
              type="button"
              className="day-modal-export-btn"
              onClick={handleExport}
            >
              Export
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
