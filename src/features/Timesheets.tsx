import { RestrictedDate } from "./calendar/CalendarAccess";
import HoursInput from "../components/HoursInput";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ArrowLeft,
  ArrowRight,
  Clock3,
  Send,
  Download,
  Pencil,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "../app/providers";
import { sheet, entries, projects, rpc } from "../lib/api";
import {
  previewWork,
  previewEntries,
  previewProjects,
  previewSheet,
} from "../lib/preview";
import type { Entry } from "../lib/types";
import {
  dateKey,
  weekStart,
  weekDays,
  minutesLabel,
  parseMinutes,
  downloadCsv,
  errorMessage,
} from "../lib/domain";
import {
  PageHeader,
  Stat,
  Badge,
  Modal,
  EmptyState,
  Loading,
  ErrorState,
  useToast,
} from "../components/ui";
export function useTimesheet(week: string) {
  const { preview } = useAuth();
  const s = useQuery({
    queryKey: ["sheet", week, preview],
    queryFn: () =>
      preview
        ? Promise.resolve({ ...previewSheet, week_start: week })
        : sheet(week),
  });
  const e = useQuery({
    queryKey: ["entries", s.data?.id, week, preview],
    queryFn: () =>
      preview
        ? Promise.resolve(
            previewWork.filter(
              (entry) =>
                entry.timesheets.user_id === "preview" &&
                weekDays(week).includes(entry.work_date),
            ),
          )
        : entries(s.data!.id),
    enabled: !!s.data,
  });
  return { s, e };
}
export default function Timesheets() {
  const { preview } = useAuth();
  const [week, setWeek] = useState(weekStart());
  const { s, e } = useTimesheet(week);
  const p = useQuery({
    queryKey: ["projects", preview],
    queryFn: () => (preview ? Promise.resolve(previewProjects) : projects()),
  });
  const [editing, setEditing] = useState<Entry | null>(null);
  const [open, setOpen] = useState(false);
  const [restricted, setRestricted] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const days = weekDays(week);
  const rows = e.data ?? [];
  const total = rows.reduce((a, b) => a + b.minutes, 0);
  const editable = !!s.data;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["sheet"] });
    void qc.invalidateQueries({ queryKey: ["entries"] });
  };
  async function act(fn: () => Promise<unknown>, message: string) {
    if (preview) {
      toast("Preview only. Connect Supabase to save real work.");
      return;
    }
    setBusy(true);
    try {
      await fn();
      refresh();
      toast(message);
      setConfirm(false);
      setDeleting(null);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  function shift(n: number) {
    const d = new Date(`${week}T12:00:00`);
    d.setDate(d.getDate() + n * 7);
    setWeek(dateKey(d));
  }
  return (
    <>
      <PageHeader
        eyebrow="MAKE YOUR TIME COUNT"
        title="Your week, in focus"
        description="A clear record of the work that moves things forward."
        actions={
          <>
            <button
              className="button secondary"
              onClick={() =>
                downloadCsv(`timesheet-${week}.csv`, [
                  ["Date", "Project", "Description", "Minutes"],
                  ...rows.map((r) => [
                    r.work_date,
                    r.projects?.name,
                    r.description,
                    r.minutes,
                  ]),
                ])
              }
            >
              <Download size={16} />
              Export
            </button>
            <button
              className="button"
              disabled={!editable}
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus size={17} />
              Add entry
            </button>
          </>
        }
      />
      <div className="stats-grid stats-grid--three">
        <Stat
          label="Time recorded"
          value={minutesLabel(total)}
          detail="Across this week’s entries"
          icon={<Clock3 size={19} />}
        />
        <Stat
          label="Days with entries"
          value={`${new Set(rows.map((r) => r.work_date)).size} / 7`}
          detail="Every contribution has its place"
          icon={<CheckCircle2 size={19} />}
        />
        <Stat
          label="Timesheet status"
          value={
            <Badge tone={s.data?.status === "approved" ? "green" : "purple"}>
              {s.data?.status ?? "Loading"}
            </Badge>
          }
          detail={
            s.data?.review_note || "Review your entries before submitting"
          }
          icon={<Send size={19} />}
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              {new Date(`${week}T12:00:00`).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
              })}{" "}
              –{" "}
              {new Date(`${days[6]}T12:00:00`).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </h2>
            <p>Your weekly timesheet</p>
          </div>
          <div className="week-nav">
            <button
              className="icon-button"
              aria-label="Previous week"
              onClick={() => shift(-1)}
            >
              <ArrowLeft size={17} />
            </button>
            <button
              className="button secondary small"
              onClick={() => setWeek(weekStart())}
            >
              This week
            </button>
            <button
              className="icon-button"
              aria-label="Next week"
              onClick={() => shift(1)}
            >
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
        <div className="week-strip">
          {days.map((d) => (
            <div key={d} className={d === dateKey(new Date()) ? "today" : ""}>
              <span>
                {new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: "short",
                })}
              </span>
              <strong>{Number(d.slice(-2))}</strong>
              <small>
                {minutesLabel(
                  rows
                    .filter((r) => r.work_date === d)
                    .reduce((a, b) => a + b.minutes, 0),
                )}
              </small>
            </div>
          ))}
        </div>
        {s.isPending || e.isPending ? (
          <Loading />
        ) : s.error || e.error ? (
          <ErrorState error={s.error || e.error} retry={refresh} />
        ) : rows.length ? (
          <div className="table-scroll timesheet-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project & work</th>
                  <th>Duration</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {new Date(`${r.work_date}T12:00:00`).toLocaleDateString(
                        undefined,
                        { weekday: "short", month: "short", day: "numeric" },
                      )}
                    </td>
                    <td>
                      <strong>{r.projects?.name || "Project"}</strong>
                      <span>{r.description}</span>
                    </td>
                    <td className="numeric">{minutesLabel(r.minutes)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          disabled={!editable}
                          className="icon-button"
                          aria-label={`Edit ${r.description}`}
                          onClick={() => {
                            setEditing(r);
                            setOpen(true);
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          disabled={!editable}
                          className="icon-button"
                          aria-label={`Delete ${r.description}`}
                          onClick={() => setDeleting(r)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="A fresh week starts here"
            description="Add the work you’ve done. Your entries stay in draft until you submit."
            action={
              <button className="button" onClick={() => setOpen(true)}>
                <Plus size={16} />
                Add your first entry
              </button>
            }
          />
        )}
        <div className="panel-footer">
          <p>
            Only record time you actually worked. Editing submitted work reopens
            it as a draft for review.
          </p>
          <button
            className="button"
            disabled={
              !rows.length ||
              !["draft", "rejected"].includes(s.data?.status || "")
            }
            onClick={() => setConfirm(true)}
          >
            Review & submit <ArrowRight size={16} />
          </button>
        </div>
      </section>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit your entry" : "A little progress, recorded"}
        description="Choose a project and record the time you actually worked."
      >
        <form
          key={`${editing?.id || "new"}-${open}`}
          onSubmit={async (event) => {
            event.preventDefault();
            if (preview) {
              toast("Preview only. Your sample data stays unchanged.");
              setOpen(false);
              return;
            }
            const f = new FormData(event.currentTarget);
            setBusy(true);
            try {
              await rpc("save_time_entry", {
                p_sheet: s.data!.id,
                p_date: f.get("date"),
                p_project: f.get("project"),
                p_description: f.get("description"),
                p_minutes: parseMinutes(String(f.get("hours"))),
                p_id: editing?.id ?? null,
                p_version: editing?.version ?? null,
              });
              refresh();
              setOpen(false);
              toast("Time entry saved.");
            } catch (err) {
              if (errorMessage(err).includes("Restricted date")) {
                setOpen(false);
                setRestricted(String(f.get("date")));
              } else toast(errorMessage(err), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <label>
              Date
              <input
                type="date"
                name="date"
                min={week}
                max={days[6]}
                defaultValue={
                  editing?.work_date ||
                  (days.includes(dateKey(new Date()))
                    ? dateKey(new Date())
                    : week)
                }
                required
              />
            </label>
            <HoursInput initial={editing ? editing.minutes / 60 : 1} />
          </div>
          <label>
            Project
            <select
              name="project"
              required
              defaultValue={editing?.project_id || ""}
            >
              <option value="" disabled>
                Select a project
              </option>
              {p.data
                ?.filter((x) => x.status === "active")
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            What did you work on?
            <textarea
              name="description"
              maxLength={2000}
              required
              defaultValue={editing?.description}
              placeholder="A short, useful description of your work"
              rows={3}
            />
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button className="button" disabled={busy || !s.data}>
              {busy ? "Saving…" : "Save entry"}
            </button>
          </div>
        </form>
      </Modal>
      {restricted && (
        <RestrictedDate date={restricted} onClose={() => setRestricted(null)} />
      )}
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Ready for review?"
        description="Submitting locks this week’s entries until your manager reviews them."
      >
        <div className="confirmation-summary">
          <strong>{minutesLabel(total)}</strong>
          <p>
            {rows.length} entries · Week of {week}
          </p>
        </div>
        <p>
          Confirm that these entries accurately describe the time you worked.
        </p>
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => setConfirm(false)}
          >
            Keep editing
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void act(
                () =>
                  rpc("submit_timesheet", {
                    p_id: s.data!.id,
                    p_version: s.data!.version,
                  }),
                "Timesheet submitted for review.",
              )
            }
          >
            Submit timesheet
          </button>
        </div>
      </Modal>
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Remove this entry?"
        description="This removes the selected draft entry from your timesheet."
      >
        <p>{deleting?.description}</p>
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => setDeleting(null)}
          >
            Keep entry
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={() =>
              deleting &&
              void act(
                () =>
                  rpc("delete_time_entry", {
                    p_id: deleting.id,
                    p_version: deleting.version,
                  }),
                "Entry removed.",
              )
            }
          >
            Remove entry
          </button>
        </div>
      </Modal>
    </>
  );
}
