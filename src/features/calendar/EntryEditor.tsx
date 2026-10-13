import { automationClick, automationWait, type CalendarAutomationDraft } from "../../lib/jarvisUiAutomation";
import { previewCalendarCommand } from "./previewCalendar";
import LeaveSending from "../../components/LeaveSending";
import { useEffect, useRef, useState } from "react";
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
  automation,
}: {
  editing: EditingEntry;
  onClose: () => void;
  onSaved: () => void;
  onRestricted: (date: string) => void;
  canEditDate: (date: string) => boolean;
  people: Employee[];
  projects: Project[];
  selectedUser: string;
  automation?: { draft: CalendarAutomationDraft; signal: AbortSignal; onReady: (error?: Error) => void };
}) {
  const { preview, member, profile } = useAuth();
  const [kind, setKind] = useState(
    editing.leave ? "leave" : editing.kind || "work",
  );
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const manage = member?.role !== "employee";
  const [formNode, setFormNode] = useState<HTMLFormElement | null>(null);
  const automationCallback = useRef(automation?.onReady);
  const [typedDescription,setTypedDescription] = useState("");
  const [selectedProject,setSelectedProject] = useState("");
  automationCallback.current = automation?.onReady;
  const [hoursFilled, setHoursFilled] = useState(false), [automationReady, setAutomationReady] = useState(false);
  const submitted = useRef(false);
  useEffect(() => {
    if (!automation || !formNode) return;
    const local = new AbortController(), signal = AbortSignal.any([automation.signal,local.signal]);
    const draft = automation.draft;
    void (async () => {
      const form = formNode;
      const project = form.querySelector<HTMLSelectElement>('[name="project"]');
      const description = form.querySelector<HTMLTextAreaElement>('[name="description"]');
      if (!project || !description || !Array.from(project.options).some(option => option.value === draft.projectId)) throw new Error("The Jira project is not available in the calendar dropdown.");
      await automationClick(project,signal); setSelectedProject(draft.projectId);
      await automationClick(description,signal); description.focus();
      for (let length=0;length<draft.description.length;length+=2) {
        setTypedDescription(draft.description.slice(0,length+2));
        description.scrollTop = description.scrollHeight; await automationWait(35,signal);
      }
      setHoursFilled(true); await automationWait(100,signal);
      const hours = form.querySelector<HTMLInputElement>('[name="hours"]');
      if (hours) await automationClick(hours,signal);
      setAutomationReady(true); await automationWait(100,signal);
      const save = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!save) throw new Error("The calendar save button is unavailable.");
      await automationClick(save,signal);
    })().catch(error => { if (!signal.aborted) automationCallback.current?.(error instanceof Error ? error : new Error("Calendar automation failed")); });
    return () => local.abort();
  }, [automation?.draft, automation?.signal, formNode]);

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
        ref={setFormNode}
        onSubmit={async (event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          if (automation) {
            if (!automationReady || submitted.current || automation.signal.aborted) return;
            submitted.current = true;
            if (String(f.get("project")) !== automation.draft.projectId || String(f.get("description")) !== automation.draft.description || !Number.isFinite(Number(f.get("hours"))) || Math.abs(Number(f.get("hours")) * 60 - automation.draft.minutes) > 0.000001) {
              automation.onReady(new Error("Calendar fields changed during automation. No timesheet entry was saved.")); return;
            }
            if (!canEditDate(automation.draft.date)) { automation.onReady(new Error("This calendar date is restricted. No entry was saved.")); return; }
            setBusy(true); automation.onReady(); return;
          }
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
                defaultValue={automation ? undefined : editing.entry?.project_id || ""}
                value={automation ? selectedProject : undefined}
                onChange={automation ? e => setSelectedProject(e.target.value) : undefined}
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
                defaultValue={automation ? undefined : editing.entry?.description}
                value={automation ? typedDescription : undefined}
                onChange={automation ? e => setTypedDescription(e.target.value) : undefined}
              />
            </label>
            <div className="form-grid">
              <label>
                Task status
                <select
                  name="status"
                  defaultValue={automation ? "Completed" : editing.entry?.task_status || "In Progress"}
                >
                  <option>Pending</option>
                  <option>In Progress</option>
                  <option>Completed</option>
                </select>
              </label>
              <HoursInput
                key={automation ? String(hoursFilled) : "manual"}
                initial={automation && hoursFilled ? automation.draft.minutes / 60 : editing.entry ? editing.entry.minutes / 60 : 1}
                precise={!!automation}
                readOnly={!!automation}
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
          <button type="submit" className="button" disabled={busy || (!!automation && !automationReady)}>
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
