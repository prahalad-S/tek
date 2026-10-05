import { previewCalendarCommand } from "./previewCalendar";
import LeaveSending from "../../components/LeaveSending";
import { useState } from "react";
import { useAuth } from "../../app/providers";
import { rpc } from "../../lib/api";
import { parseMinutes, errorMessage } from "../../lib/domain";
import type { Employee, Project } from "../../lib/types";
import { Modal, useToast } from "../../components/ui";
import HoursInput from "../../components/HoursInput";
import type { CalendarEntry, CalendarLeave } from "./domain";
export type EditingEntry = {
  date: string;
  entry?: CalendarEntry;
  leave?: CalendarLeave;
  kind?: "work" | "leave";
};
export default function EntryEditor({
  editing,
  onClose,
  onSaved,
  onRestricted,
  canEditDate,
  people,
  projects,
  selectedUser,
}: {
  editing: EditingEntry;
  onClose: () => void;
  onSaved: () => void;
  onRestricted: (date: string) => void;
  canEditDate: (date: string) => boolean;
  people: Employee[];
  projects: Project[];
  selectedUser: string;
}) {
  const { preview, member, profile } = useAuth();
  const [kind, setKind] = useState(
    editing.leave ? "leave" : editing.kind || "work",
  );
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const manage = member?.role !== "employee";
  return (
    <Modal
      open
      onClose={onClose}
      title={
        editing.entry || editing.leave
          ? "Edit calendar entry"
          : "Add a calendar entry"
      }
      description="Record work or request time off. Leave remains pending until reviewed."
      wide
    >
      {busy && kind === "leave" && <LeaveSending />}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          const user = String(
            f.get("user") || selectedUser || profile?.user_id,
          );
          if (!canEditDate(String(f.get("date")))) {
            onClose();
            onRestricted(String(f.get("date")));
            return;
          }
          const command = async (name: string, args: Record<string, any>) =>
            preview
              ? previewCalendarCommand(name, args, user)
              : rpc(name, args);
          setBusy(true);
          try {
            if (kind === "leave")
              await new Promise((resolve) => setTimeout(resolve, 600));
            if (kind === "leave") {
              await command("save_calendar_leave", {
                p_user: user,
                p_from: f.get("date"),
                p_to: f.get("to"),
                p_reason: f.get("reason"),
                p_type: f.get("leave_type"),
                p_minutes: Number(f.get("duration")),
                p_id: editing.leave?.id || null,
                p_version: editing.leave?.version || null,
              });
            } else
              await command("save_calendar_entry", {
                p_user: user,
                p_date: f.get("date"),
                p_project: f.get("project"),
                p_description: f.get("description"),
                p_minutes: parseMinutes(String(f.get("hours"))),
                p_status: f.get("status"),
                p_id: editing.entry?.id || null,
                p_version: editing.entry?.version || null,
              });
            onSaved();
            onClose();
            toast(
              kind === "leave"
                ? "Leave request sent for review."
                : "Calendar entry saved.",
            );
          } catch (error) {
            const message = errorMessage(error);
            if (message.includes("Restricted date")) {
              onClose();
              onRestricted(String(f.get("date")));
            } else toast(message, "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        {manage && (
          <label>
            Employee
            <select
              name="user"
              defaultValue={
                editing.entry?.timesheets.user_id ||
                editing.leave?.user_id ||
                selectedUser ||
                profile?.user_id ||
                ""
              }
              disabled={!!editing.entry || !!editing.leave}
            >
              {people
                .filter((p) => p.user_id)
                .map((p) => (
                  <option key={p.id} value={p.user_id!}>
                    {p.full_name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          Entry type
          <select
            aria-label="Entry type"
            value={kind}
            disabled={!!editing.entry || !!editing.leave}
            onChange={(e) => setKind(e.target.value as any)}
          >
            <option value="work">Work</option>
            <option value="leave">Leave</option>
          </select>
        </label>
        <label>
          {kind === "leave" ? "From date" : "Date"}
          <input
            name="date"
            type="date"
            required
            defaultValue={
              editing.leave?.from_date ||
              editing.entry?.work_date ||
              editing.date
            }
          />
        </label>
        {kind === "work" ? (
          <>
            <label>
              Project
              <select
                name="project"
                required
                defaultValue={editing.entry?.project_id || ""}
              >
                <option value="" disabled>
                  Select a project
                </option>
                {projects
                  .filter((p) => p.status === "active")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            {manage && (
              <a
                className="text-link"
                href={preview ? "/preview/projects" : "/projects"}
                target="_blank"
                rel="noreferrer"
              >
                Create or manage projects ↗
              </a>
            )}
            <label>
              What did you work on?
              <textarea
                name="description"
                required
                maxLength={2000}
                defaultValue={editing.entry?.description}
              />
            </label>
            <div className="form-grid">
              <label>
                Task status
                <select
                  name="status"
                  defaultValue={editing.entry?.task_status || "In Progress"}
                >
                  <option>Pending</option>
                  <option>In Progress</option>
                  <option>Completed</option>
                </select>
              </label>
              <HoursInput
                initial={editing.entry ? editing.entry.minutes / 60 : 1}
              />
            </div>
          </>
        ) : (
          <>
            <label>
              To date
              <input
                name="to"
                type="date"
                required
                defaultValue={editing.leave?.to_date || editing.date}
              />
            </label>
            <div className="form-grid">
              <label>
                Leave type
                <select
                  name="leave_type"
                  defaultValue={editing.leave?.leave_type || "Casual"}
                >
                  {["Casual", "Sick", "Earned", "Emergency", "Unpaid"].map(
                    (t) => (
                      <option key={t}>{t}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Duration per day
                <select
                  name="duration"
                  defaultValue={editing.leave?.daily_minutes || 480}
                >
                  <option value={480}>Full day (8 hours)</option>
                  <option value={240}>Half day (4 hours)</option>
                </select>
              </label>
            </div>
            <label>
              Reason / remarks
              <textarea
                name="reason"
                required
                maxLength={2000}
                defaultValue={editing.leave?.reason}
              />
            </label>
          </>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy
              ? "Saving…"
              : kind === "leave"
                ? "Send leave request"
                : "Save entry"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
