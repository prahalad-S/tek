import FormerEmployees from "./profiles/FormerEmployees";
import LeaveSending from "../components/LeaveSending";
import { CalendarAccessPanel } from "./calendar/CalendarAccess";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileText,
  Download,
  Trash2,
  ShieldCheck,
  Plus,
  CalendarDays,
  Check,
  X,
  Clock3,
} from "lucide-react";
import { useAuth } from "../app/providers";
import { client } from "../lib/supabase";
import {
  documents,
  upload,
  removeDocument,
  signedUrl,
  rpc,
  entries,
} from "../lib/api";
import { errorMessage, minutesLabel, dateKey } from "../lib/domain";
import type { DocumentRecord, Timesheet } from "../lib/types";
import {
  PageHeader,
  Modal,
  Loading,
  EmptyState,
  ErrorState,
  Badge,
  useToast,
} from "../components/ui";
export { default as Documents } from "./notes/NotesWorkspace";
export function Leave() {
  const { preview, profile } = useAuth();
  const q = useQuery({
    queryKey: ["leave", preview],
    queryFn: async () => {
      if (preview) return [];
      const { data, error } = await client()
        .from("leave_requests")
        .select("*")
        .eq("user_id", profile!.user_id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  return (
    <>
      <PageHeader
        eyebrow="SPACE TO RECHARGE"
        title="Time away"
        description="Make room for life beyond work."
        actions={
          <button className="button" onClick={() => setOpen(true)}>
            <Plus size={16} />
            Request time off
          </button>
        }
      />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Your requests</h2>
            <p>A clear view of your time away.</p>
          </div>
          <CalendarDays size={20} />
        </div>
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : !q.data.length ? (
          <EmptyState
            title="Nothing planned just yet"
            description="Your time-off requests and their decisions will appear here."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((r) => (
                  <tr key={r.id}>
                    <td>{r.from_date}</td>
                    <td>{r.to_date}</td>
                    <td>{r.reason}</td>
                    <td>
                      <Badge
                        tone={r.status === "approved" ? "green" : "purple"}
                      >
                        {r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Plan a little time away"
        description="Your request will be reviewed by your team lead or an authorized manager."
      >
        {busy && <LeaveSending />}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (preview) {
              setBusy(true);
              await new Promise((resolve) => setTimeout(resolve, 900));
              setBusy(false);
              toast("Preview only. No leave request was sent.");
              setOpen(false);
              return;
            }
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              await new Promise((resolve) => setTimeout(resolve, 600));
              await rpc("save_calendar_leave", {
                p_user: profile!.user_id,
                p_type: f.get("leave_type"),
                p_minutes: Number(f.get("duration")),
                p_from: f.get("from"),
                p_to: f.get("to"),
                p_reason: f.get("reason"),
              });
              void qc.invalidateQueries({ queryKey: ["leave"] });
              void qc.invalidateQueries({ queryKey: ["calendar-leave"] });
              void qc.invalidateQueries({ queryKey: ["leave-approvals"] });
              setOpen(false);
              toast("Time-off request sent.");
            } catch (e) {
              toast(errorMessage(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <label>
              From
              <input
                type="date"
                name="from"
                required
                defaultValue={dateKey(new Date())}
              />
            </label>
            <label>
              To
              <input
                type="date"
                name="to"
                required
                defaultValue={dateKey(new Date())}
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Leave type
              <select name="leave_type">
                {["Casual", "Sick", "Earned", "Emergency", "Unpaid"].map(
                  (t) => (
                    <option key={t}>{t}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              Duration per day
              <select name="duration">
                <option value={480}>Full day (8 hours)</option>
                <option value={240}>Half day (4 hours)</option>
              </select>
            </label>
          </div>
          <label>
            Reason
            <textarea name="reason" rows={3} required maxLength={2000} />
          </label>
          <div className="form-actions">
            <button className="button" disabled={busy}>
              Send request
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
export function Approvals() {
  const { preview, member, profile } = useAuth();
  const q = useQuery({
    queryKey: ["approvals", preview],
    queryFn: async () => {
      if (preview) return [];
      const { data, error } = await client()
        .from("timesheets")
        .select("*")
        .eq("status", "submitted")
        .neq("user_id", profile!.user_id!);
      if (error) throw error;
      return data as Timesheet[];
    },
    enabled: member?.role !== "employee",
  });
  const leave = useQuery({
    queryKey: ["leave-approvals", preview],
    queryFn: async () => {
      if (preview) return [];
      const { data, error } = await client()
        .from("leave_requests")
        .select("*")
        .eq("status", "pending")
        .neq("user_id", profile!.user_id!);
      if (error) throw error;
      return data;
    },
    enabled: member?.role !== "employee",
  });
  const people = useQuery({
    queryKey: ["approval-names", preview],
    queryFn: async () => {
      if (preview) return [];
      const { data, error } = await client()
        .from("employees")
        .select("user_id,full_name");
      if (error) throw error;
      return data;
    },
    enabled: member?.role !== "employee",
  });
  const [selected, setSelected] = useState<Timesheet | null>(null);
  const details = useQuery({
    queryKey: ["review-entries", selected?.id],
    queryFn: () => entries(selected!.id),
    enabled: !!selected,
  });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  if (member?.role === "employee")
    return (
      <EmptyState
        title="Your own workspace"
        description="Approval queues are available to assigned managers and administrators."
      />
    );
  async function review(approve: boolean) {
    setBusy(true);
    try {
      await rpc("review_timesheet", {
        p_id: selected!.id,
        p_version: selected!.version,
        p_approve: approve,
        p_note: note,
      });
      void qc.invalidateQueries({ queryKey: ["approvals"] });
      setSelected(null);
      toast(approve ? "Timesheet approved." : "Changes requested.");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  const name = (id: string) =>
    people.data?.find((p) => p.user_id === id)?.full_name || "Team member";
  return (
    <>
      <PageHeader
        eyebrow="KEEP GOOD WORK MOVING"
        title="Ready for your review"
        description="Thoughtful decisions. Clear next steps for your team."
      />
      <section className="panel">
        <div className="panel-heading">
          <h2>Timesheets</h2>
          <Badge>{q.data?.length ?? 0} pending</Badge>
        </div>
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : !q.data.length ? (
          <EmptyState
            title="You’re all caught up"
            description="Submitted team timesheets will appear here for review."
          />
        ) : (
          q.data.map((s) => (
            <button
              className="approval-row"
              key={s.id}
              onClick={() => {
                setSelected(s);
                setNote("");
              }}
            >
              <Clock3 size={20} />
              <span>
                <strong>{name(s.user_id)}</strong>Week of {s.week_start}
              </span>
              <Badge tone="purple">Review timesheet</Badge>
            </button>
          ))
        )}
      </section>
      <section className="panel spaced-panel">
        <div className="panel-heading">
          <h2>Time-off requests</h2>
          <Badge>{leave.data?.length ?? 0} pending</Badge>
        </div>
        {leave.error ? (
          <ErrorState error={leave.error} />
        ) : !leave.data?.length ? (
          <EmptyState
            title="No time-off requests waiting"
            description="New requests will be shown here."
          />
        ) : (
          leave.data.map((r) => (
            <div className="approval-row" key={r.id}>
              <div>
                <strong>
                  {name(r.user_id)} · {r.from_date} — {r.to_date}
                </strong>
                <p>{r.reason}</p>
              </div>
              <div className="row-actions">
                {[true, false].map((ok) => (
                  <button
                    key={String(ok)}
                    disabled={busy}
                    className="button secondary small"
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await rpc("review_leave", {
                          p_id: r.id,
                          p_approve: ok,
                        });
                        void qc.invalidateQueries({
                          queryKey: ["leave-approvals"],
                        });
                        toast("Leave decision saved.");
                      } catch (e) {
                        toast(errorMessage(e), "error");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {ok ? <Check size={15} /> : <X size={15} />}{" "}
                    {ok ? "Approve" : "Decline"}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
      <section className="panel spaced-panel">
        <CalendarAccessPanel />
      </section>
      <FormerEmployees />
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Review ${selected ? name(selected.user_id) : ""}’s week`}
        description={`Week of ${selected?.week_start}`}
        wide
      >
        {details.isPending ? (
          <Loading />
        ) : details.error ? (
          <ErrorState error={details.error} />
        ) : (
          <>
            <div className="review-list">
              {details.data?.map((e) => (
                <div key={e.id}>
                  <span>{e.work_date}</span>
                  <div>
                    <strong>{e.projects?.name}</strong>
                    <p>{e.description}</p>
                  </div>
                  <Badge>{minutesLabel(e.minutes)}</Badge>
                </div>
              ))}
            </div>
            <label>
              Review note
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Required when requesting changes"
                maxLength={2000}
              />
            </label>
            <div className="form-actions">
              <button
                className="button secondary"
                disabled={busy || !note.trim()}
                onClick={() => void review(false)}
              >
                Request changes
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => void review(true)}
              >
                Approve timesheet
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
