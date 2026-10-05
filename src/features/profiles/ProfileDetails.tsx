import { useProfileManagement } from "../../lib/useProfileManagement";
import {
  BriefcaseBusiness,
  CalendarDays,
  CircleCheck,
  Languages,
  Globe,
  ExternalLink,
  Award,
  FolderKanban,
  ScrollText,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Pencil,
  FileDown,
  FileType2,
  GraduationCap,
  BadgeCheck,
} from "lucide-react";
import { errorMessage } from "../../lib/domain";
import { tenureSince } from "../../lib/employeeDetails";
import { useState, useEffect } from "react";
import PrivateInformation from "./PrivateInformation";
import ProfileDocuments from "./ProfileDocuments";

import { useQuery } from "@tanstack/react-query";
import { Mail, MapPin, ShieldCheck } from "lucide-react";
import { useAuth } from "../../app/providers";
import { extendedProfile, previewExtended } from "../../lib/profiles";
import type { Employee } from "../../lib/types";

import {
  Avatar,
  Badge,
  Loading,
  ErrorState,
  useToast,
} from "../../components/ui";
export default function ProfileDetails({ employee }: { employee: Employee }) {
  const { preview, profile } = useAuth();
  const management = useProfileManagement();
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const canPrivate =
    management.canManage(employee) || employee.user_id === profile?.user_id;

  const q = useQuery({
    queryKey: ["extended-profile", employee.id, preview, canPrivate],
    queryFn: () =>
      preview
        ? Promise.resolve(previewExtended(employee))
        : extendedProfile(employee, canPrivate),
  });
  const completeness = q.data
    ? [
        employee.full_name,
        employee.title,
        employee.location,
        q.data.profile.summary,
        q.data.skills.length,
        q.data.experience.length,
        q.data.education.length,
        q.data.profile.languages.length,
        q.data.profile.website,
      ].filter((value) =>
        typeof value === "string" ? value.trim().length > 0 : !!value,
      ).length
    : 0;
  async function download(format: "pdf" | "docx") {
    if (!q.data) return;
    setDownloading(true);
    try {
      const { downloadProfileDocument } =
        await import("../../lib/profileDocuments");
      await downloadProfileDocument(
        employee,
        q.data,
        "resume",
        format,
        preview,
        undefined,
        canPrivate,
      );
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setDownloading(false);
    }
  }
  return (
    <div className="profile-detail-page">
      <div className="profile-view-actions" aria-label="Profile actions">
        {(management.canManage(employee) ||
          employee.user_id === profile?.user_id) && (
          <Link
            className="icon-button"
            to={`${preview ? "/preview" : ""}/profile${management.canManage(employee) ? `?employee=${employee.id}` : ""}`}
            aria-label={
              employee.user_id === profile?.user_id
                ? "Edit my profile"
                : "Edit employee profile"
            }
            title="Edit profile"
          >
            <Pencil size={18} />
          </Link>
        )}
        <button
          className="icon-button"
          aria-label="Download profile PDF"
          title="Download profile PDF"
          disabled={!q.data || downloading}
          onClick={() => void download("pdf")}
        >
          <FileDown size={18} />
        </button>
        <button
          className="icon-button"
          aria-label="Download profile Word"
          title="Download profile Word"
          disabled={!q.data || downloading}
          onClick={() => void download("docx")}
        >
          <FileType2 size={18} />
        </button>
      </div>
      <header className="expanded-person-header">
        <Avatar person={employee} size="hero" />
        <div>
          <span className="eyebrow">TEKZENIT / PEOPLE</span>
          <h2>{employee.full_name}</h2>
          <div className="profile-role-contact">
            <span>{employee.title || "Team member"}</span>
            <a href={`mailto:${employee.email}`}>
              <Mail size={15} />
              {employee.email}
            </a>
          </div>
          <div className="profile-identity-meta">
            <Badge tone="purple">
              {employee.departments?.name || "Team member"}
            </Badge>
            <span>
              <MapPin size={15} />
              {employee.location || "Location pending"}
            </span>
            <span>
              <BadgeCheck size={15} />
              {employee.employee_code || "Code not added"}
            </span>
          </div>
        </div>

        {q.data && (
          <div
            className="profile-completeness"
            role="img"
            aria-label={`Professional profile completeness: ${completeness} of 9 fields filled`}
          >
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <circle className="completion-track" cx="22" cy="22" r="18" />
              <circle
                className="completion-value"
                cx="22"
                cy="22"
                r="18"
                pathLength="100"
                strokeDasharray={`${(completeness / 9) * 100} 100`}
              />
              <text x="22" y="25">
                {Math.round((completeness / 9) * 100)}%
              </text>
            </svg>
            <span>
              Profile completeness
              <small>{completeness} of 9 professional details</small>
            </span>
          </div>
        )}
      </header>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : (
        <>
          <section className="profile-section">
            <div className="profile-about-heading">
              <h3>About & expertise</h3>
            </div>
            <p>
              {q.data.profile.summary || "No professional summary added yet."}
            </p>
            <div className="skills-list">
              {q.data.skills.map((s) => (
                <Badge key={s} tone="purple">
                  {s}
                </Badge>
              ))}
            </div>
            <dl className="profile-facts">
              <div>
                <dt>
                  <BriefcaseBusiness size={14} aria-hidden="true" />
                  Experience at Tekzenit
                </dt>
                <dd>{tenureSince(q.data.profile.joined_on, now)}</dd>
              </div>
              <div>
                <dt>
                  <CalendarDays size={14} aria-hidden="true" />
                  Joined
                </dt>
                <dd>{q.data.profile.joined_on || "Not added"}</dd>
              </div>
              <div>
                <dt>
                  <CircleCheck size={14} aria-hidden="true" />
                  Status
                </dt>
                <dd className="profile-status">
                  {q.data.profile.employment_status}
                  {q.data.profile.employment_status?.toLowerCase() ===
                    "active" && (
                    <span className="active-status-dot" aria-label="Active" />
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  <Languages size={14} aria-hidden="true" />
                  Languages
                </dt>
                <dd>{q.data.profile.languages.join(", ") || "Not added"}</dd>
              </div>
              <div>
                <dt>
                  <Globe size={14} aria-hidden="true" />
                  Website
                </dt>
                <dd>
                  {/^https?:\/\//i.test(q.data.profile.website || "") ? (
                    <a
                      className="profile-external-link"
                      href={q.data.profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {q.data.profile.website}
                      <ExternalLink size={14} aria-label="Opens in a new tab" />
                    </a>
                  ) : (
                    q.data.profile.website || "Not added"
                  )}
                </dd>
              </div>
            </dl>
          </section>
          <section className="profile-section profile-experience">
            <h3>Experience</h3>
            {q.data.experience.length ? (
              q.data.experience.map((r, i) => (
                <article className="career-row" key={r.id || i}>
                  <h4>{r.role}</h4>
                  <strong>{r.company}</strong>
                  <small className="badge badge--purple">
                    {r.start_date || "Date not added"} —{" "}
                    {r.end_date || "Present"}
                  </small>
                  <p>{r.description}</p>
                </article>
              ))
            ) : (
              <p className="muted">No experience added yet.</p>
            )}
          </section>
          <section className="profile-section">
            <h3>Education</h3>
            {q.data.education.length ? (
              q.data.education.map((r, i) => (
                <article className="education-card" key={r.id || i}>
                  <GraduationCap size={22} />
                  <div>
                    <h4>{r.qualification}</h4>
                    <p>
                      {r.institution} ·{" "}
                      {[r.start_year, r.end_year].filter(Boolean).join("–")}
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <p className="muted">No education added yet.</p>
            )}
          </section>
          <section className="profile-section">
            <h3>Projects, awards & certifications</h3>
            {!q.data.achievements.length && (
              <p className="muted">
                No projects, awards or certifications added yet.
              </p>
            )}
            {q.data.achievements.map((r, i) => (
              <article
                className="education-card achievement-card"
                key={r.id || i}
              >
                {r.kind.toLowerCase().includes("award") ? (
                  <Award size={22} />
                ) : r.kind.toLowerCase().includes("project") ? (
                  <FolderKanban size={22} />
                ) : (
                  <ScrollText size={22} />
                )}
                <div>
                  <Badge tone="purple">{r.kind}</Badge>
                  <h4>{r.title}</h4>
                  <p>{r.description}</p>
                  {/^https?:\/\//.test(r.url) && (
                    <a href={r.url} target="_blank" rel="noreferrer">
                      View details{" "}
                      <ExternalLink size={14} aria-label="Opens in a new tab" />
                    </a>
                  )}
                </div>
              </article>
            ))}
          </section>
          <ProfileDocuments employee={employee} data={q.data} />
          {canPrivate && q.data.privateDetails && (
            <PrivateInformation
              details={q.data.privateDetails}
              owner={employee.user_id === profile?.user_id}
            />
          )}
        </>
      )}
    </div>
  );
}
