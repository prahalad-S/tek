import UpcomingBirthdays from "./UpcomingBirthdays";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ArrowRight,
  Clock3,
  FolderKanban,
  Sparkles,
  Users,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "../app/providers";
import { projects } from "../lib/api";
import { previewEmployees, previewProjects } from "../lib/preview";
import { client } from "../lib/supabase";
import { weekStart, minutesLabel, weekDays } from "../lib/domain";
import { useTimesheet } from "./Timesheets";
import { Avatar, Badge, PageHeader, Stat, EmptyState } from "../components/ui";
export default function Home() {
  const { profile, preview } = useAuth();
  const base = preview ? "/preview" : "";
  const { s, e } = useTimesheet(weekStart());
  const p = useQuery({
    queryKey: ["projects", preview],
    queryFn: () => (preview ? Promise.resolve(previewProjects) : projects()),
  });
  const currentProject = useQuery({
    queryKey: ["home-current-project", profile?.user_id, preview],
    queryFn: async () => {
      if (preview) return previewProjects[0].name;
      const r = await client()
        .from("project_memberships")
        .select("projects(name,status)")
        .eq("user_id", profile!.user_id!);
      if (r.error) throw r.error;
      return (
        r.data
          .flatMap((v: any) => (v.projects ? [v.projects] : []))
          .filter((v: any) => v.status === "active")
          .map((v: any) => v.name)
          .sort()
          .join(", ") || "Not assigned"
      );
    },
    enabled: !!profile?.user_id,
  });
  const people = useQuery({
    queryKey: ["home-people", preview],
    queryFn: async () => {
      if (preview) return previewEmployees.slice(1, 5);
      const { data, error } = await client()
        .from("employees")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(4);
      if (error) throw error;
      return data;
    },
  });
  const total = e.data?.reduce((a, b) => a + b.minutes, 0) ?? 0;
  return (
    <>
      <PageHeader
        eyebrow={new Date()
          .toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })
          .toUpperCase()}
        title={`A good day starts here, ${profile?.full_name.split(" ")[0] || "teammate"}`}
        description="A little clarity for your day. More room for the work you love."
        actions={
          <Link className="button" to={`${base}/timesheets`}>
            Open timesheet <ArrowUpRight size={16} />
          </Link>
        }
      />
      <div className="home-banner">
        <div>
          <Badge tone="purple">YOUR WORKSPACE, REIMAGINED</Badge>
          <h2>
            Less busywork.
            <br />
            More meaningful work.
          </h2>
          <p>
            Your people, projects, and progress.
            <br />
            Finally, in one thoughtful place.
          </p>
          <Link to={`${base}/people`}>
            Meet your team <ArrowRight size={17} />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <span />
          <span />
          <span />
          <span className="banner-art-center">
            <Sparkles size={40} />
          </span>
        </div>
        <div className="banner-caption">
          Good things happen
          <br />
          <strong>when we work together.</strong>
        </div>
      </div>
      <div className="stats-grid stats-grid--four">
        <Stat
          label="Your week so far"
          value={e.isPending ? "—" : minutesLabel(total)}
          detail="Recorded time, ready when you are"
          icon={<Clock3 size={18} />}
        />
        <Stat
          label="Active projects"
          value={p.data?.filter((x) => x.status === "active").length ?? "—"}
          detail="Ideas moving in the right direction"
          icon={<FolderKanban size={18} />}
        />
        <Stat
          label="Your timesheet"
          value={<Badge tone="purple">{s.data?.status ?? "Loading"}</Badge>}
          detail="A clear view of your weekly progress"
          icon={<CheckCircle2 size={18} />}
        />
        <Stat
          label="Current project"
          value={
            <span className="current-project-name">
              {currentProject.isPending
                ? "Loading…"
                : currentProject.error
                  ? "Unavailable"
                  : currentProject.data}
            </span>
          }
          detail="Your active project assignments"
          icon={<FolderKanban size={18} />}
        />
      </div>
      <div className="home-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>A week of progress</h2>
              <p>Small steps add up.</p>
            </div>
            <Link className="text-link" to={`${base}/timesheets`}>
              View timesheet <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="week-chart">
            {weekDays(weekStart()).map((date) => {
              const mins =
                e.data
                  ?.filter((x) => x.work_date === date)
                  .reduce((a, b) => a + b.minutes, 0) ?? 0;
              return (
                <div className="chart-day" key={date}>
                  <span>{minutesLabel(mins)}</span>
                  <div className="chart-track">
                    <div
                      style={{
                        height: `${Math.min(100, (mins / 1440) * 100)}%`,
                      }}
                    />
                  </div>
                  <small>
                    {new Date(`${date}T12:00:00`).toLocaleDateString(
                      undefined,
                      { weekday: "short" },
                    )}
                  </small>
                </div>
              );
            })}
          </div>
          <div className="chart-footnote">
            Daily scale: 0–24 hours. No assumed working-hour target.
          </div>
          {e.error && (
            <p className="field-error">Time data could not be loaded.</p>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>People to know</h2>
              <p>Better work starts with connection.</p>
            </div>
            <Users size={20} />
          </div>
          <div className="people-mini">
            {people.data?.map((person) => (
              <Link to={`${base}/people`} key={person.id}>
                <Avatar person={person} />
                <div>
                  <strong>{person.full_name}</strong>
                  <span>{person.title || "Team member"}</span>
                </div>
                <ArrowUpRight size={16} />
              </Link>
            ))}
            {people.error && <p>Directory is temporarily unavailable.</p>}
            {people.data?.length === 0 && (
              <EmptyState
                title="Your team starts here"
                description="Provision employees to connect your workspace."
              />
            )}
          </div>
          <Link className="panel-bottom-link" to={`${base}/people`}>
            Explore the directory <ArrowRight size={16} />
          </Link>
        </section>
      </div>
      <UpcomingBirthdays />
      {!profile?.employee_code && (
        <div className="onboarding-note">
          <span className="onboarding-icon">
            <Sparkles size={20} />
          </span>
          <div>
            <strong>A profile that feels like you</strong>
            <p>
              Add your employee code and a few personal details to complete your
              profile.
            </p>
          </div>
          <Link className="button secondary" to={`${base}/profile`}>
            Complete profile <ArrowRight size={16} />
          </Link>
        </div>
      )}
    </>
  );
}
