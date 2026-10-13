import DeleteEmployee from "./profiles/DeleteEmployee";
import { useSearchParams } from "react-router-dom";
import { workHistory } from "../lib/workHistory";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck, Download, Building2, Trash2 } from "lucide-react";
import { useAuth } from "../app/providers";
import { client } from "../lib/supabase";
import { rpc } from "../lib/api";
import { downloadCsv, errorMessage } from "../lib/domain";
import {
  PageHeader,
  Modal,
  EmptyState,
  Loading,
  ErrorState,
  Badge,
  useToast,
} from "../components/ui";
export function Access() {
  const { preview, member, profile } = useAuth();
  const [params] = useSearchParams();
  const [deletingEmployee, setDeletingEmployee] = useState(
    params.get("delete") === "1",
  );
  const [open, setOpen] = useState(params.get("new") === "1");
  useEffect(() => {
    if (params.get("new") === "1") setOpen(true);
    if (params.get("delete") === "1") setDeletingEmployee(true);
  }, [params]);
  const [busy, setBusy] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [change, setChange] = useState<{
    id: string;
    name: string;
    role: string;
    active: boolean;
  } | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ["access", preview],
    queryFn: async () => {
      if (preview) return { employees: [], members: [] };
      const [e, m] = await Promise.all([
        client().from("employees").select("*").order("full_name"),
        client().from("memberships").select("*"),
      ]);
      if (e.error) throw e.error;
      if (m.error) throw m.error;
      return { employees: e.data, members: m.data };
    },
    enabled: member?.role === "admin",
  });
  const departments = useQuery({
    queryKey: ["departments", preview],
    queryFn: async () => {
      if (preview) return [];
      const { data, error } = await client()
        .from("departments")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: member?.role === "admin",
  });
  if (member?.role !== "admin")
    return (
      <EmptyState
        title="Administrator access required"
        description="Only workspace administrators can manage access."
      />
    );
  return (
    <>
      <PageHeader
        eyebrow="A TRUSTED WORKSPACE"
        title="People & permissions"
        description="Provision a work email. Employees activate their account and complete their own profile."
        actions={
          <>
            <button
              className="button secondary"
              onClick={() => setDepartmentOpen(true)}
            >
              <Building2 size={16} />
              Department
            </button>
            <button className="button" onClick={() => setOpen(true)}>
              <Plus size={16} />
              Add employee
            </button>
            <button
              className="button secondary"
              onClick={() => setDeletingEmployee(true)}
            >
              <Trash2 size={16} />
              Delete employee
            </button>
          </>
        }
      />
      <DeleteEmployee
        open={deletingEmployee}
        onClose={() => setDeletingEmployee(false)}
      />
      <div className="info-strip">
        <ShieldCheck size={18} />
        <span>
          Everyone starts as an employee. Access never comes from an employee
          code or job title.
        </span>
      </div>
      <section className="panel">
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : !q.data.employees.length ? (
          <EmptyState
            title="Your team’s starting point"
            description={
              preview
                ? "Access management uses live Supabase records. No real accounts appear in this preview."
                : "Add an employee’s work email so they can create their account."
            }
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Account</th>
                  <th>Role</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {q.data.employees.map((e) => {
                  const m = q.data.members.find((m) => m.user_id === e.user_id);
                  return (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.full_name}</strong>
                        <span>{e.email}</span>
                      </td>
                      <td>{m ? "Activated" : "Awaiting activation"}</td>
                      <td>
                        <Badge>{m?.role || "employee"}</Badge>
                      </td>
                      <td>
                        {m && m.user_id !== profile?.user_id ? (
                          <button
                            className="button secondary small"
                            onClick={() =>
                              setChange({
                                id: m.user_id,
                                name: e.full_name,
                                role: m.role,
                                active: m.active,
                              })
                            }
                          >
                            {m.active ? "Manage access" : "Restore access"}
                          </button>
                        ) : m ? (
                          "Your account"
                        ) : (
                          "Not yet activated"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Welcome someone new"
        description="Provision their work email. They can then activate their account from the sign-in screen."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (preview) {
              toast("Provisioning is disabled in preview.");
              return;
            }
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              await rpc("provision_employee_at_location", {
                p_email: f.get("email"),
                p_name: f.get("name"),
                p_title: f.get("title"),
                p_department: f.get("department") || null,
                p_location: f.get("location"),
              });
              void qc.invalidateQueries({ queryKey: ["access"] });
              void qc.invalidateQueries({ queryKey: ["employees"] });
              void qc.invalidateQueries({ queryKey: ["directory-all"] });
              void qc.invalidateQueries({ queryKey: ["people-directory"] });
              void qc.invalidateQueries({ queryKey: ["employee-count"] });
              setOpen(false);
              toast(
                "Employee provisioned. Ask them to activate with their work email.",
              );
            } catch (e) {
              toast(errorMessage(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Full name
            <input name="name" required maxLength={120} />
          </label>
          <label>
            Work email
            <input name="email" type="email" required />
          </label>
          <label>
            Title
            <input name="title" maxLength={120} />
          </label>
          <label>
            Location
            <select name="location">
              <option value="">Assign later</option>
              {[
                ...new Set([
                  "Hyderabad, IN",
                  "Dallas, US",
                  "Remote",
                  ...(q.data?.employees || [])
                    .map((e) => e.location)
                    .filter(Boolean),
                ]),
              ]
                .sort()
                .map((l) => (
                  <option key={l}>{l}</option>
                ))}
            </select>
          </label>
          <label>
            Department
            <select name="department">
              <option value="">Assign later</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button className="button" disabled={busy}>
              Add employee
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={departmentOpen}
        onClose={() => setDepartmentOpen(false)}
        title="Create a department"
        description="Keep the organization structure clear."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (preview) {
              toast("Preview only.");
              return;
            }
            setBusy(true);
            try {
              await rpc("create_department", {
                p_name: new FormData(e.currentTarget).get("name"),
              });
              void qc.invalidateQueries({ queryKey: ["departments"] });
              setDepartmentOpen(false);
              toast("Department created.");
            } catch (e) {
              toast(errorMessage(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Name
            <input name="name" required maxLength={100} />
          </label>
          <button className="button" disabled={busy}>
            Create department
          </button>
        </form>
      </Modal>
      <Modal
        open={!!change}
        onClose={() => setChange(null)}
        title={`Access for ${change?.name}`}
        description="Changing access takes effect on subsequent database requests."
      >
        {change && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              try {
                await rpc("manage_membership", {
                  p_user: change.id,
                  p_role: f.get("role"),
                  p_active: f.get("active") === "yes",
                });
                void qc.invalidateQueries({ queryKey: ["access"] });
                setChange(null);
                toast("Access updated.");
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Role
              <select name="role" defaultValue={change.role}>
                <option value="employee">Employee</option>
                <option value="manager">Department manager</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
            <label>
              Account access
              <select name="active" defaultValue={change.active ? "yes" : "no"}>
                <option value="yes">Active</option>
                <option value="no">Disabled</option>
              </select>
            </label>
            <button className="button" disabled={busy}>
              Confirm access change
            </button>
          </form>
        )}
      </Modal>
    </>
  );
}
export function Reports() {
  const { preview } = useAuth();
  const [clear, setClear] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["history", preview],
    queryFn: () => workHistory(preview),
  });
  return (
    <>
      <PageHeader
        eyebrow="THE BIGGER PICTURE"
        title="Timesheet history"
        description="Your authorized records, with a clear trail of progress."
        actions={
          <>
            <button className="button secondary" onClick={() => setClear(true)}>
              <Trash2 size={16} />
              Clear history
            </button>
            <button
              className="button secondary"
              disabled={!q.data?.length}
              onClick={() =>
                downloadCsv("timesheet-history.csv", [
                  ["Employee", "Week", "Status", "Hours", "Activity"],
                  ...(q.data ?? []).map((s) => [
                    s.employee_name,
                    s.week_start,
                    s.status,
                    s.time_entries.reduce(
                      (a: number, b: { minutes: number }) => a + b.minutes,
                      0,
                    ) / 60,
                    s.activities
                      .map((a) => `${a.actor_name}: ${a.action}`)
                      .join("; "),
                  ]),
                ])
              }
            >
              <Download size={16} />
              Export CSV
            </button>
          </>
        }
      />
      <section className="panel">
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : !q.data.length ? (
          <EmptyState
            title="Your story is just beginning"
            description="Timesheet history will appear as you record and submit your work."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Week beginning</th>
                  <th>Status</th>
                  <th>Recorded hours</th>
                  <th>What was done</th>
                  <th>Review note</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((s) => (
                  <tr key={s.id}>
                    <td>{s.employee_name}</td>
                    <td>{s.week_start}</td>
                    <td>
                      <Badge
                        tone={s.status === "approved" ? "green" : "purple"}
                      >
                        {s.status}
                      </Badge>
                    </td>
                    <td>
                      {(
                        s.time_entries.reduce(
                          (a: number, b: { minutes: number }) => a + b.minutes,
                          0,
                        ) / 60
                      ).toFixed(2)}
                    </td>
                    <td>
                      <ul className="history-activities">
                        {s.activities.slice(0, 8).map((a) => (
                          <li key={a.id}>
                            <strong>{a.action}</strong>
                            <small>
                              {a.actor_name} ·{" "}
                              {new Date(a.created_at).toLocaleString()}
                            </small>
                          </li>
                        ))}
                      </ul>
                      {!s.activities.length && "No recorded activity yet"}
                      {s.activities.length > 8 && (
                        <small>
                          +{s.activities.length - 8} more in CSV export
                        </small>
                      )}
                    </td>
                    <td>{s.review_note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Modal
        open={clear}
        onClose={() => setClear(false)}
        title="Clear your history view?"
        description="This hides the currently listed history for your account. Timesheets and audit records are retained."
      >
        <button
          className="button"
          onClick={async () => {
            try {
              if (!preview)
                await rpc("clear_workspace_history", {
                  p_sheets: (q.data || [])
                    .map((s) => s.sheet_id)
                    .filter(Boolean),
                  p_activities: (q.data || []).flatMap((s) =>
                    s.activities.map((a) => a.id),
                  ),
                });
              await qc.invalidateQueries({ queryKey: ["history"] });
              setClear(false);
              toast(
                preview
                  ? "Preview: no history changed."
                  : "History view cleared.",
              );
            } catch (e) {
              toast(errorMessage(e), "error");
            }
          }}
        >
          Clear history
        </button>
      </Modal>
      <p className="muted" style={{ marginTop: 16 }}>
        Showing up to 100 authorized timesheets and the latest 500 activity
        events. Exports contain only the records shown.
      </p>
    </>
  );
}
