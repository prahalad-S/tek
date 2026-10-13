import ProjectActivitySparkline from "./ProjectActivitySparkline";
import ProjectPlanning from "./ProjectPlanning";
import { useCardReflow } from "../components/useCardReflow";
import { ProjectAvatars, useProjectAvatars } from "./ProjectAvatars";
import { useSearchParams } from "react-router-dom";
import { client } from "../lib/supabase";
import ProjectTeam from "./ProjectTeam";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ArrowUpRight,
  FolderKanban,
  LayoutGrid,
  List,
} from "lucide-react";
import { useAuth } from "../app/providers";
import { projects, rpc } from "../lib/api";
import { previewProjects, previewWork } from "../lib/preview";
import type { Project } from "../lib/types";
import { errorMessage } from "../lib/domain";
import {
  PageHeader,
  Badge,
  Modal,
  Loading,
  ErrorState,
  EmptyState,
  useToast,
} from "../components/ui";
export default function Projects() {
  const { preview, member, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const avatarPeople = useProjectAvatars(preview);
  const scope = params.get("scope");
  const assignments = useQuery({
    queryKey: ["project-scopes", scope, profile?.user_id],
    queryFn: async () => {
      if (preview || !scope) return null;
      let users = [profile!.user_id!];
      if (scope === "team") {
        if (!profile?.department_id) return [];
        const r = await client()
          .from("employees")
          .select("user_id")
          .eq("department_id", profile!.department_id!);
        if (r.error) throw r.error;
        users = r.data.map((p) => p.user_id).filter(Boolean);
      }
      if (!users.length) return [];
      const r = await client()
        .from("project_memberships")
        .select("project_id")
        .in("user_id", users);
      if (r.error) throw r.error;
      return r.data.map((p) => p.project_id);
    },
  });
  const q = useQuery({
    queryKey: ["projects", preview],
    queryFn: () => (preview ? Promise.resolve(previewProjects) : projects()),
  });
  const [view, setView] = useState(params.get("view") === "list" ? "list" : "grid");
  useEffect(() => { const next = params.get("view"); if (next === "grid" || next === "list") setView(next); }, [params]);
  const { reflow } = useCardReflow(".project-grid [data-project-id]");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Project | null>(null);
  const planningId=params.get("planning");
  const planningProject=q.data?.find(p=>p.id===planningId) || null;
  function showPlanning(id:string|null) {const next=new URLSearchParams(params); if(id) next.set("planning",id); else next.delete("planning");setParams(next);}
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const manage = member?.role === "admin" || member?.role === "manager";
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setConfirmDelete(false); }, [open, selected?.id]);
  async function deleteProject() {
    if (!selected || !manage) return;
    if (preview) { toast("Preview only. Sign in to delete a project."); return; }
    setBusy(true);
    try {
      await rpc("delete_project", { p_project: selected.id });
      await Promise.all(["projects", "project-team", "project-avatars", "project-scopes"].map(key => qc.invalidateQueries({ queryKey: [key] })));
      setOpen(false); setSelected(null); toast("Project deleted.");
    } catch (error) { toast((error as { code?: string })?.code === "PGRST202" ? "The workspace needs the project management update before projects can be deleted." : errorMessage(error), "error"); }
    finally { setBusy(false); }
  }
  return (
    <>
      <PageHeader
        eyebrow="WORK THAT MATTERS"
        title={
          scope === "mine"
            ? "My projects"
            : scope === "team"
              ? "Team projects"
              : "Moving forward, together"
        }
        description="A shared view of the projects bringing our ideas to life."
        actions={
          <>
            <div className="view-toggle" aria-label="Project view">
              {[
                { id: "grid", label: "Project grid view", Icon: LayoutGrid },
                { id: "list", label: "Project list view", Icon: List },
              ].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={view === id}
                  onClick={() => reflow(() => setView(id))}
                >
                  <Icon size={18} />
                </button>
              ))}
            </div>
            <button type="button" className={`button ${planningId==="all"?"":"secondary"}`} aria-pressed={planningId==="all"} onClick={()=>showPlanning("all")}>All projects</button>
            {manage && (
              <button
                className="button"
                onClick={() => {
                  setSelected(null);
                  setOpen(true);
                }}
              >
                <Plus size={16} />
                New project
              </button>
            )}
          </>
        }
      />
      {assignments.error ? (
        <ErrorState error={assignments.error} />
      ) : q.isPending || assignments.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : !q.data.length ? (
        <EmptyState
          title="Room for your next idea"
          description="Your administrator or manager can create your first project."
        />
      ) : planningId ? (
        avatarPeople.isPending ? <Loading/> : avatarPeople.error ? <ErrorState error={avatarPeople.error}/> : planningId!=="all" && !planningProject ? <EmptyState title="Project unavailable" description="Return to the project cards and select an available project."/> :
        <ProjectPlanning projects={q.data} selected={planningProject} people={avatarPeople.data?.people || []} members={avatarPeople.data?.members || []} preview={preview}
          onBack={()=>showPlanning(null)} onSelect={p=>showPlanning(p?.id || "all")} onManage={p=>{setSelected(p);setOpen(true);}}/>
      ) : (
        <div
          className={`project-grid ${view === "list" ? "project-grid--list" : ""}`}
        >
          {q.data
            .filter((p) => !assignments.data || assignments.data.includes(p.id))
            .map((p, i) => (
              <button
                className={`project-card project-color-${i % 4}`}
                key={p.id}
                data-project-id={p.id}
                onClick={() => {
                  showPlanning(p.id);
                }}
              >
                <div className="project-top">
                  <span className="project-symbol">
                    <FolderKanban size={24} />
                  </span>
                  <Badge tone={p.status === "active" ? "green" : "neutral"}>
                    {p.status}
                  </Badge>
                </div>
                <h2>{p.name}</h2>
                {[
                  (p as any).client_name,
                  (p as any).city,
                  (p as any).country,
                ].some(Boolean) && (
                  <p className="project-meta">
                    {[
                      (p as any).client_name,
                      [(p as any).city, (p as any).country]
                        .filter(Boolean)
                        .join(", "),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                <div className="project-card-activity-row">
                  <p className="project-description">{p.description || "A new project, full of possibility."}</p>
                  <ProjectActivitySparkline projectId={p.id}/>
                </div>
                {preview && (
                  <p className="project-meta">
                    Demo work ·{" "}
                    {previewWork
                      .filter((entry) => entry.project_id === p.id)
                      .reduce((total, entry) => total + entry.minutes, 0) /
                      60}{" "}
                    hours · 8 weeks
                  </p>
                )}
                <ProjectAvatars
                  projectId={p.id}
                  data={avatarPeople.data}
                  pending={avatarPeople.isPending}
                  error={!!avatarPeople.error}
                />
                <div className="project-bottom">
                  <span>{manage ? "View & manage" : "Project details"}</span>
                  <ArrowUpRight size={18} />
                </div>
              </button>
            ))}
        </div>
      )}
      <Modal
        wide
        open={open}
        onClose={() => setOpen(false)}
        title={selected ? selected.name : "Start something good"}
        description={
          manage
            ? "Keep your project details clear and useful."
            : "A shared view of this project."
        }
      >
        {manage ? (
          <form
            className="project-editor-columns"
            key={selected?.id || "new"}
            onSubmit={async (e) => {
              e.preventDefault();
              if (preview) {
                toast("Preview only. Connect your workspace to save projects.");
                setOpen(false);
                return;
              }
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                await rpc("save_project_details", {
                  p_id: selected?.id ?? null,
                  p_name: f.get("name"),
                  p_description: f.get("description"),
                  p_status: f.get("status"),
                  p_client: f.get("client"),
                  p_country: f.get("country"),
                  p_city: f.get("city"),
                });
                void qc.invalidateQueries({ queryKey: ["projects"] });
                setOpen(false);
                toast("Project saved.");
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Project name
              <input
                name="name"
                defaultValue={selected?.name}
                required
                maxLength={120}
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                rows={2}
                maxLength={4000}
                defaultValue={selected?.description}
              />
            </label>
            <div className="form-grid">
              {[
                ["client", "Client name"],
                ["country", "Country"],
                ["city", "City"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    name={key}
                    maxLength={120}
                    defaultValue={
                      (selected as any)?.[
                        key + (key === "client" ? "_name" : "")
                      ] || ""
                    }
                  />
                </label>
              ))}
            </div>
            <label>
              Status
              <select name="status" defaultValue={selected?.status || "active"}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <div className="form-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="button" disabled={busy}>
                Save project
              </button>
            </div>
          </form>
        ) : (
          <>
            <Badge>{selected?.status}</Badge>
            <p>{selected?.description}</p>
          </>
        )}
        {preview && selected && (
          <section className="panel" style={{ padding: 20 }}>
            <h3>Recent demo timesheet entries</h3>
            {previewWork
              .filter((entry) => entry.project_id === selected.id)
              .sort((a, b) => b.work_date.localeCompare(a.work_date))
              .slice(0, 8)
              .map((entry) => (
                <p key={entry.id}>
                  {entry.work_date} · {entry.description} · {entry.minutes / 60}
                  h
                </p>
              ))}
          </section>
        )}
        {selected && <ProjectTeam key={selected.id} projectId={selected.id} manage={manage} />}
        {selected && manage && <section className="project-delete-actions">
          {confirmDelete ? <><p>Delete “{selected.name}” and its team assignments? This cannot be undone. Projects with recorded time must be marked completed instead.</p>
            <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep project</button>{" "}
            <button type="button" className="button danger" disabled={busy} onClick={() => void deleteProject()}>{busy ? "Deleting…" : "Confirm delete project"}</button>
          </> : <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete project</button>}
        </section>}
      </Modal>
    </>
  );
}
