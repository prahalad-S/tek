import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../app/providers";
import { client } from "../lib/supabase";
import { rpc } from "../lib/api";
import { directoryPeople } from "../lib/profiles";
import { previewEmployees } from "../lib/preview";
import { errorMessage } from "../lib/domain";
import { Loading, ErrorState, useToast } from "../components/ui";
export default function ProjectTeam({ projectId, manage }: { projectId: string; manage: boolean }) {
  const { preview } = useAuth();
  const qc = useQueryClient(), toast = useToast();
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useState("");
  const [employee, setEmployee] = useState("");
  const q = useQuery({
    queryKey: ["project-team", projectId, preview],
    queryFn: async () => {
      if (preview) return { people: previewEmployees, members: [] as { employee_id: string }[], directoryReady: true };
      const [people, memberships] = await Promise.all([
        directoryPeople(true),
        client().from("project_team_directory").select("employee_id").eq("project_id", projectId),
      ]);
      if (memberships.error && ["PGRST205", "42P01"].includes(memberships.error.code)) {
        const legacy = await client().from("project_memberships").select("user_id").eq("project_id", projectId);
        if (legacy.error) throw legacy.error;
        return { people, members: people.filter(p => legacy.data.some(m => m.user_id === p.user_id)).map(p => ({ employee_id: p.id })), directoryReady: false };
      }
      if (memberships.error) throw memberships.error;
      return { people, members: [...new Map((memberships.data as { employee_id: string }[]).map(m=>[m.employee_id,m])).values()], directoryReady: true };
    },
  });
  async function assign(employeeId: string, assigned: boolean) {
    setBusy(true);
    try {
      if (q.data?.directoryReady) await rpc("set_project_employee", { p_project: projectId, p_employee: employeeId, p_assigned: assigned });
      else {
        const user = q.data?.people.find(p => p.id === employeeId)?.user_id;
        if (!user) throw new Error("The workspace needs the project team update before employees without a portal login can be assigned.");
        await rpc("set_project_member", { p_project: projectId, p_user: user, p_assigned: assigned });
      }
      await Promise.all(["project-team", "project-avatars", "analytics-directory", "project-scopes"].map(key => qc.invalidateQueries({ queryKey: [key] })));
      setEmployee(""); toast(assigned ? "Teammate added." : "Teammate removed.");
    } catch (error) { toast(errorMessage(error), "error"); }
    finally { setBusy(false); }
  }
  const active = q.data?.people.filter(p => !p.archived_at && !["left", "terminated"].includes((p.departure_status || "").toLowerCase())) || [];
  const locations = [...new Set(active.map(p => p.location).filter(Boolean))].sort();
  const choices = active.filter(p => (!location || p.location === location) && !q.data?.members.some(m => m.employee_id === p.id));
  return <section className="project-team">
    <h3>Project team</h3>
    {q.isPending ? <Loading /> : q.error ? <ErrorState error={q.error} /> : <>
      <ul>{q.data.members.map(m => {
        const person = q.data.people.find(p => p.id === m.employee_id);
        return <li key={m.employee_id}><span>{person?.full_name || "Employee"}{person?.location ? ` · ${person.location}` : ""}</span>
          {manage && !preview && <button type="button" className="button secondary small" aria-label={`Remove ${person?.full_name || "employee"} from project`} disabled={busy} onClick={() => void assign(m.employee_id, false)}>Remove</button>}
        </li>;
      })}</ul>
      {!q.data.members.length && <p className="muted">No teammates assigned yet.</p>}
      {manage && !q.data.directoryReady && <p className="muted">The project team update is required to assign employees who have not activated a portal login.</p>}
      {manage && <form onSubmit={e => { e.preventDefault(); if (preview) { toast("Preview only. Sign in to assign teammates."); return; } if (employee) void assign(employee, true); }}>
        <div className="form-grid">
          <label>Location<select value={location} disabled={busy} onChange={e => { setLocation(e.target.value); setEmployee(""); }}><option value="">All locations</option>{locations.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Teammate<select value={employee} required disabled={busy} onChange={e => setEmployee(e.target.value)}><option value="">Choose a teammate</option>{choices.map(p => <option value={p.id} key={p.id}>{p.full_name}{p.location ? ` · ${p.location}` : ""}</option>)}</select></label>
        </div>
        {!choices.length && <p className="muted">All available teammates in this location are already assigned.</p>}
        <button className="button secondary" disabled={busy || !employee}>Add to team</button>
      </form>}
    </>}
  </section>;
}
