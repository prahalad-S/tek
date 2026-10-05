import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../app/providers";
import { client } from "../../lib/supabase";
import { rpc } from "../../lib/api";
import { errorMessage, dateKey } from "../../lib/domain";
import { directoryPeople } from "../../lib/profiles";
import { Modal, Badge, ErrorState, useToast } from "../../components/ui";
export function RestrictedDate({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  const { preview } = useAuth();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <Modal
      open
      onClose={onClose}
      title="Access restricted"
      description="This date is older than the 48-hour editing window. Add a reason and request temporary access from your team lead."
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (preview) {
            toast("Preview only. No access request sent.");
            onClose();
            return;
          }
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await rpc("request_calendar_access", {
              p_from: f.get("from"),
              p_to: f.get("to"),
              p_reason: f.get("reason"),
              p_type: f.get("type"),
            });
            toast("Access request sent to your managers.");
            onClose();
          } catch (error) {
            toast(errorMessage(error), "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label>
            From
            <input name="from" type="date" required defaultValue={date} />
          </label>
          <label>
            To
            <input name="to" type="date" required defaultValue={date} />
          </label>
        </div>
        <label>
          Edit type
          <select name="type">
            <option>Full day</option>
            <option>Half day</option>
          </select>
        </label>
        <label>
          Reason
          <textarea name="reason" required maxLength={2000} />
        </label>
        <button className="button" disabled={busy}>
          Request editing access
        </button>
      </form>
    </Modal>
  );
}
export function CalendarAccessPanel() {
  const { preview, member, profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const manage = member?.role !== "employee";
  const q = useQuery({
    queryKey: ["access-requests", preview],
    queryFn: async () => {
      if (preview) return [];
      const { data, error } = await client()
        .from("calendar_access_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
  const people = useQuery({
    queryKey: ["directory-all", preview],
    queryFn: () => (preview ? Promise.resolve([]) : directoryPeople()),
  });
  const eligible =
    people.data?.filter(
      (p) =>
        p.user_id &&
        p.user_id !== profile?.user_id &&
        (member?.role === "admin" || p.department_id === member?.department_id),
    ) || [];
  async function review(id: string, approve: boolean) {
    setBusy(true);
    try {
      await rpc("review_calendar_access", { p_id: id, p_approve: approve });
      await qc.invalidateQueries({ queryKey: ["access-requests"] });
      await qc.invalidateQueries({ queryKey: ["calendar-access"] });
      toast("Access decision saved.");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel-form">
      <h2>Calendar editing access</h2>
      <p className="muted">
        Employees can edit today and the previous two calendar days. Approved
        grants last 48 hours and never unlock submitted or approved timesheets.
      </p>
      {q.error ? (
        <ErrorState error={q.error} />
      ) : q.data?.length ? (
        q.data.map((r) => (
          <article className="career-row" key={r.id}>
            <strong>
              {people.data?.find((p) => p.user_id === r.user_id)?.full_name ||
                "Employee"}{" "}
              · {r.from_date} — {r.to_date}
            </strong>
            <p>{r.reason}</p>
            <Badge>{r.status}</Badge>
            {manage &&
              r.status === "pending" &&
              r.user_id !== profile?.user_id && (
                <div className="row-actions">
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => void review(r.id, true)}
                  >
                    Approve access
                  </button>
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => void review(r.id, false)}
                  >
                    Decline access
                  </button>
                </div>
              )}
          </article>
        ))
      ) : (
        <p>No access requests.</p>
      )}
      {manage && (
        <details>
          <summary>Grant editing access</summary>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (preview) {
                toast("Preview only.");
                return;
              }
              setBusy(true);
              const f = new FormData(e.currentTarget);
              const user = f.get("user");
              try {
                await rpc("grant_calendar_access", {
                  p_users:
                    user === "all" ? eligible.map((p) => p.user_id) : [user],
                  p_from: f.get("from"),
                  p_to: f.get("to"),
                  p_reason: f.get("reason"),
                });
                await qc.invalidateQueries({ queryKey: ["access-requests"] });
                toast("Temporary access granted.");
              } catch (error) {
                toast(errorMessage(error), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Employee
              <select name="user" required>
                <option value="all">All employees you manage</option>
                {eligible.map((p) => (
                  <option key={p.id} value={p.user_id!}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                From
                <input
                  name="from"
                  type="date"
                  required
                  defaultValue={dateKey(new Date())}
                />
              </label>
              <label>
                To
                <input
                  name="to"
                  type="date"
                  required
                  defaultValue={dateKey(new Date())}
                />
              </label>
            </div>
            <label>
              Reason
              <textarea name="reason" required maxLength={2000} />
            </label>
            <button disabled={busy} className="button">
              Grant for 48 hours
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
