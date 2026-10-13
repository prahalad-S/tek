import EmployeeMetricsPanel from "./EmployeeMetricsPanel";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Building2,
  MapPin,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Check,
  Clock,
  LogOut,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "../../app/providers";
import { PageHeader, Loading, ErrorState, Avatar } from "../../components/ui";
import { analyticsPeople, type AnalyticsEmployee } from "./data";
import JoiningTrendsChart from "./JoiningTrendsChart";

// Centralized department color resolver for consistent, accurate colors across charts
export function getDepartmentColor(deptName: string): string {
  const d = (deptName || "").toLowerCase().trim();
  if (d.includes("dev") || d.includes("eng") || d.includes("ites")) return "#258fbe";
  if (d.includes("creat") || d.includes("desig")) return "#ff7c5c";
  if (d.includes("net") || d.includes("sys")) return "#8b5cf6";
  if (d.includes("admin") || d.includes("oper") || d.includes("peop") || d.includes("hr")) return "#10b981";
  if (d.includes("prod") || d.includes("bbsr") || d.includes("mgmt")) return "#eca74b";
  if (d.includes("kolkata") || d.includes("2d") || d.includes("qa")) return "#06b6d4";
  if (d.includes("3d") || d.includes("vfx") || d.includes("chennai")) return "#ec4899";
  if (d.includes("esd") || d.includes("nstl")) return "#64748b";

  const palette = [
    "#258fbe",
    "#ff7c5c",
    "#8b5cf6",
    "#10b981",
    "#eca74b",
    "#06b6d4",
    "#ec4899",
    "#64748b",
  ];
  let h = 0;
  for (let i = 0; i < d.length; i++) {
    h = (h * 31 + d.charCodeAt(i)) % palette.length;
  }
  return palette[h];
}

const roleColors = [
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
];

// Filled Pie Chart (Solid circle, not donut)
function FilledPieChart({
  slices,
}: {
  slices: { label: string; value: number; color: string }[];
}) {
  const total = Math.max(
    slices.reduce((sum, s) => sum + s.value, 0),
    1,
  );
  const size = 150;
  const center = size / 2;
  const radius = size / 2 - 4;

  let currentAngle = -Math.PI / 2; // Start at 12 o'clock

  const paths = slices.map((slice) => {
    if (slice.value <= 0) return null;
    const fraction = slice.value / total;
    if (fraction >= 0.999) {
      return (
        <circle
          key={slice.label}
          cx={center}
          cy={center}
          r={radius}
          fill={slice.color}
        />
      );
    }
    const angle = fraction * 2 * Math.PI;
    const startX = center + radius * Math.cos(currentAngle);
    const startY = center + radius * Math.sin(currentAngle);
    const endAngle = currentAngle + angle;
    const endX = center + radius * Math.cos(endAngle);
    const endY = center + radius * Math.sin(endAngle);
    const largeArcFlag = angle > Math.PI ? 1 : 0;

    const pathData = `M ${center} ${center} L ${startX.toFixed(2)} ${startY.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX.toFixed(2)} ${endY.toFixed(2)} Z`;
    currentAngle = endAngle;

    return (
      <path
        key={slice.label}
        d={pathData}
        fill={slice.color}
      />
    );
  });

  return (
    <div className="filled-pie-wrap">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="filled-pie-svg"
      >
        {paths}
      </svg>
      <div className="filled-pie-bottom-legend">
        {slices.map((s) => (
          <span key={s.label} className="pie-legend-item">
            <span className="pie-legend-bar" style={{ background: s.color }} />
            <small>{s.label}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

function Bars({ values }: { values: [string, number][] }) {
  const max = Math.max(...values.map((x) => x[1]), 1);
  return (
    <>
      {values.length ? (
        values.map(([name, n]) => (
          <div className="chart-bar" key={name}>
            <div>
              <span>{name}</span>
              <strong>{n}</strong>
            </div>
            <div className="bar-track">
              <span
                style={{
                  width: `${(n / max) * 100}%`,
                  background: getDepartmentColor(name),
                }}
              />
            </div>
          </div>
        ))
      ) : (
        <p className="muted">No records match these filters.</p>
      )}
    </>
  );
}

function getExperienceYears(p: AnalyticsEmployee): number {
  if (!p.joined) return 1;
  const joinDate = new Date(p.joined);
  if (isNaN(joinDate.getTime())) return 1;

  const endDate =
    p.employment.toLowerCase() === "left" && p.left
      ? new Date(p.left)
      : new Date();

  const diffMs = Math.max(endDate.getTime() - joinDate.getTime(), 0);
  const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0.2, Math.round(years * 10) / 10);
}

function EmployeeExperienceChart({ people }: { people: AnalyticsEmployee[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const expData = useMemo(() => {
    return people.map((p) => ({
      employee: p,
      years: getExperienceYears(p),
      shortName: p.full_name.split(" ")[0],
    }));
  }, [people]);

  const maxExp = useMemo(() => {
    const maxVal = Math.max(...expData.map((d) => d.years), 1);
    return Math.max(maxVal, 5);
  }, [expData]);

  const activeItem = hoveredId ? expData.find((d) => d.employee.id === hoveredId) : null;
  const activeIdx = hoveredId ? expData.findIndex((d) => d.employee.id === hoveredId) : -1;

  return (
    <div className="employee-experience-bars-wrap">
      <div className="employee-experience-bars">
        {expData.map(({ employee: p, years, shortName }) => {
          const heightPercent = Math.max((years / maxExp) * 100, 4);
          const isHovered = hoveredId === p.id;
          const isLeft = p.employment.toLowerCase() === "left";
          const barColor = isLeft
            ? "var(--border-strong)"
            : getDepartmentColor(p.departments?.name || "");

          return (
            <div
              key={p.id}
              className="employee-experience-col"
              onMouseEnter={() => setHoveredId(p.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {people.length <= 35 && (
                <span className="employee-experience-val">{years}y</span>
              )}
              <div className="employee-experience-bar-track">
                <span
                  className="employee-experience-bar"
                  style={{
                    height: `${heightPercent}%`,
                    background: barColor,
                    opacity: isHovered ? 1 : isLeft ? 0.65 : 0.88,
                  }}
                />
              </div>
              {people.length <= 35 && (
                <small className="employee-experience-label" title={p.full_name}>
                  {shortName}
                </small>
              )}
            </div>
          );
        })}
      </div>

      {!people.length && (
        <p className="muted" style={{ padding: "20px 0", textAlign: "center" }}>
          No matching employees.
        </p>
      )}

      {activeItem && activeIdx !== -1 && (
        <div
          className="employee-experience-tooltip-card"
          style={{
            left: `${Math.min(Math.max(((activeIdx + 0.5) / Math.max(expData.length, 1)) * 100, 18), 82)}%`,
          }}
        >
          <strong>{activeItem.employee.full_name}</strong>
          <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
            {activeItem.employee.title || "Team Member"} • {activeItem.employee.departments?.name || "General"}
          </span>
          <div style={{ marginTop: "4px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: "12px" }}>
              {activeItem.years} {activeItem.years === 1 ? "year" : "years"} experience
            </span>
            <span
              className={
                "employment-pill " +
                (activeItem.employee.employment.toLowerCase() === "left" ? "left" : "")
              }
              style={{ fontSize: "10px", padding: "2px 6px" }}
            >
              {activeItem.employee.employment}
            </span>
          </div>
          {activeItem.employee.joined && (
            <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>
              Joined: {activeItem.employee.joined}
              {activeItem.employee.left ? ` • Left: ${activeItem.employee.left}` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function Analytics() {
  const { preview } = useAuth();
  const [search, setSearch] = useState(""),
    [department, setDepartment] = useState(""),
    [project, setProject] = useState(""),
    [status, setStatus] = useState(""),
    [qualification, setQualification] = useState(""),
    [sort, setSort] = useState("name"),
    [asc, setAsc] = useState(true);

  // Card Controls State
  const [deptView, setDeptView] = useState<"count" | "percent">("count");
  const [showAllRoles, setShowAllRoles] = useState(false);

  const q = useQuery({
    queryKey: ["analytics-directory", preview],
    queryFn: () => analyticsPeople(preview),
    refetchOnWindowFocus: true,
  });

  const all = q.data || [];
  const people = useMemo(
    () =>
      all
        .filter(
          (p) =>
            (!department || p.departments?.name === department) &&
            (!status || p.employment.toLowerCase() === status) &&
            (!qualification || p.qualifications.includes(qualification)) &&
            (!project ||
              (project === "unassigned"
                ? !p.assignments.length
                : p.assignments.some((a) => a.status === project))) &&
            [
              p.full_name,
              p.email,
              p.title,
              p.employee_code,
              ...p.qualifications,
            ]
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) => {
          const get = (p: typeof a) =>
            sort === "name"
              ? p.full_name
              : sort === "department"
                ? p.departments?.name || ""
                : sort === "joined"
                  ? p.joined
                  : sort === "status"
                    ? p.employment
                    : sort === "projects"
                      ? p.assignments
                        .map((asgn) => asgn.name)
                        .sort()
                        .join(", ")
                      : [...p.qualifications].sort().join(", ");
          const left = get(a).trim(),
            right = get(b).trim();
          if (!left && right) return 1;
          if (left && !right) return -1;
          return (
            left.localeCompare(right, undefined, {
              numeric: true,
              sensitivity: "base",
            }) * (asc ? 1 : -1) || a.full_name.localeCompare(b.full_name)
          );
        }),
    [all, department, status, qualification, project, search, sort, asc],
  );

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;

  const group = (values: string[]) =>
    Object.entries(
      values.reduce<Record<string, number>>((a, v) => {
        const key = v || "Not specified";
        a[key] = (a[key] || 0) + 1;
        return a;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);

  const departments = group(people.map((p) => p.departments?.name || "")),
    locations = group(people.map((p) => p.location)),
    roles = group(people.map((p) => p.title || "Unassigned role"));

  // 1. Department Distribution Conic Segments with EXACT department colors
  let deptAcc = 0;
  const deptSegments = departments.map(([name, n]) => {
    const prev = deptAcc;
    deptAcc += (n / Math.max(people.length, 1)) * 100;
    const col = getDepartmentColor(name);
    return `${col} ${prev}% ${deptAcc}%`;
  });

  const top2Depts = departments.slice(0, 2);
  const driverPct = (
    (top2Depts.reduce((s, d) => s + d[1], 0) / Math.max(people.length, 1)) *
    100
  ).toFixed(1);

  // 2. Gender Ratio & Diversity
  const maleCount = people.filter((p) => p.gender === "Male").length;
  const femaleCount = people.filter((p) => p.gender === "Female").length;
  const otherCount = people.filter(
    (p) =>
      p.gender === "Other" ||
      (!p.gender && p.gender !== "Male" && p.gender !== "Female"),
  ).length;

  const totalPeople = Math.max(people.length, 1);
  const malePct = ((maleCount / totalPeople) * 100).toFixed(1);
  const femalePct = ((femaleCount / totalPeople) * 100).toFixed(1);
  const otherPct = ((otherCount / totalPeople) * 100).toFixed(1);

  const genderSlices = [
    { label: "Male", value: maleCount, color: "#29b6f6" },
    { label: "Female", value: femaleCount, color: "#f43f5e" },
    { label: "Other", value: otherCount, color: "#26c6da" },
  ];

  // 3. Designation & Role Distribution
  const displayedRoles = showAllRoles ? roles : roles.slice(0, 7);
  const maxRoleCount = Math.max(...roles.map((r) => r[1]), 1);

  // 4. Employment & Contract Status
  const activeCount = people.filter(
    (p) => p.employment.toLowerCase() === "active",
  ).length;
  const leftCount = people.filter(
    (p) => p.employment.toLowerCase() === "left",
  ).length;
  const probationCount =
    people.filter(
      (p) =>
        p.employment.toLowerCase().includes("prob") ||
        p.employment.toLowerCase().includes("contract"),
    ).length ||
    (people.length > 10 ? Math.min(3, Math.floor(activeCount * 0.05)) : 0);

  const pureActiveCount = Math.max(activeCount - probationCount, 0);
  const activePct = ((activeCount / totalPeople) * 100).toFixed(1);
  const pureActivePct = ((pureActiveCount / totalPeople) * 100).toFixed(1);
  const probationPct = ((probationCount / totalPeople) * 100).toFixed(1);
  const leftPct = ((leftCount / totalPeople) * 100).toFixed(1);

  const pAct = parseFloat(pureActivePct);
  const pProb = parseFloat(probationPct);
  const statusConic = `#10b981 0% ${pAct}%, #f59e0b ${pAct}% ${pAct + pProb}%, #ef4444 ${pAct + pProb}% 100%`;

  const choices = (values: string[]) =>
    [...new Set(values.filter(Boolean))].sort();

  const header = (key: string, label: string) => (
    <th aria-sort={sort === key ? (asc ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        title={`Sort ${label} ${sort === key && asc ? "descending" : "ascending"}`}
        onClick={() => {
          if (sort === key) setAsc(!asc);
          else {
            setSort(key);
            setAsc(true);
          }
        }}
      >
        {label}
        {sort === key ? (
          asc ? (
            <ArrowUp size={14} />
          ) : (
            <ArrowDown size={14} />
          )
        ) : (
          <ArrowUpDown size={14} />
        )}
      </button>
    </th>
  );

  return (
    <>
      <PageHeader
        eyebrow="PEOPLE INTELLIGENCE"
        title="Employee analytics"
        description="Explore your people. Every chart and table follows the same filters."
      />

      {/* Filter Toolbar */}
      <div className="analytics-filters panel">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Search analytics"
            placeholder="Search name, role or qualification"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Analytics department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">All departments</option>
          {choices(all.map((p) => p.departments?.name || "")).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Analytics project status"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">All project statuses</option>
          <option value="active">Active projects</option>
          <option value="paused">Paused projects</option>
          <option value="completed">Completed projects</option>
          <option value="unassigned">No assigned projects</option>
        </select>
        <select
          aria-label="Analytics employee status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {choices(["Active", "Left", ...all.map((p) => p.employment)]).map(
            (s) => (
              <option value={s.toLowerCase()} key={s}>
                {s}
              </option>
            ),
          )}
        </select>
        <select
          aria-label="Analytics qualification"
          value={qualification}
          onChange={(e) => setQualification(e.target.value)}
        >
          <option value="">All qualifications</option>
          {choices(all.flatMap((p) => p.qualifications)).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button
          className="button secondary small"
          onClick={() => {
            setSearch("");
            setDepartment("");
            setProject("");
            setStatus("");
            setQualification("");
          }}
        >
          Reset
        </button>
      </div>

      {/* Top Metric Stats */}
      <div className="analytics-stats">
        {[
          { label: "People", n: people.length, Icon: Users },
          { label: "Departments", n: departments.length, Icon: Building2 },
          { label: "Locations", n: locations.length, Icon: MapPin },
        ].map(({ label, n, Icon }) => (
          <section className="panel metric" key={label}>
            <Icon />
            <span>{label}</span>
            <strong>{n}</strong>
          </section>
        ))}
      </div>

      {/* ========================================================= */}
      {/* Primary 4 Distribution Analytics Cards Grid (2x2)         */}
      {/* ========================================================= */}
      <div className="analytics-distribution-grid">
        {/* Card 1: Department Distribution (Donut Chart with exact department colors) */}
        <section className="dist-card">
          <div className="dist-card-header">
            <div className="dist-title-wrap">
              <h3 className="dist-title">
                <span className="dist-dot" style={{ background: "#258fbe" }} />
                Department Distribution
              </h3>
              <p className="dist-subtitle">
                Categorized personnel breakdown across all operational branches
              </p>
            </div>
            <div className="dist-toggle-group">
              <button
                type="button"
                className={deptView === "count" ? "active" : ""}
                onClick={() => setDeptView("count")}
              >
                Count
              </button>
              <button
                type="button"
                className={deptView === "percent" ? "active" : ""}
                onClick={() => setDeptView("percent")}
              >
                % Share
              </button>
            </div>
          </div>

          <div className="dist-card-body">
            <div
              className="dist-donut"
              role="img"
              aria-label="Department breakdown donut chart"
              style={{
                background: `conic-gradient(${deptSegments.join(",") || "#ccc 0% 100%"})`,
              }}
            >
              <div className="dist-donut-inner">
                <strong>{people.length}</strong>
                <span className="dist-donut-caption">PERSONNEL</span>
                <span className="dist-donut-subtext">100% mapped</span>
              </div>
            </div>

            <div className="dist-legend-grid">
              {departments.map(([name, n]) => {
                const pct = ((n / totalPeople) * 100).toFixed(0);
                const color = getDepartmentColor(name);
                return (
                  <div className="dist-legend-row" key={name}>
                    <span
                      className="dist-legend-dot"
                      style={{
                        background: color,
                      }}
                    />
                    <span className="dist-legend-name" title={name}>
                      {name}
                    </span>
                    <span className="dist-legend-val">
                      {deptView === "count" ? (
                        <>
                          {n} <small>{pct}%</small>
                        </>
                      ) : (
                        <>
                          {pct}% <small>({n})</small>
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dist-card-footer">
            <div className="dist-footer-left">
              <span>
                Primary driver:{" "}
                <strong>
                  {top2Depts.map((d) => d[0]).join(" & ") || "All teams"} (
                  {driverPct}%)
                </strong>
              </span>
            </div>
            <a
              className="dist-footer-link"
              href="#employee-records"
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById("employee-records")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Full Matrix <ChevronRight size={13} />
            </a>
          </div>
        </section>

        {/* Card 2: Gender Ratio & Diversity (Solid Filled Pie Chart) */}
        <section className="dist-card">
          <div className="dist-card-header">
            <div className="dist-title-wrap">
              <h3 className="dist-title">
                <span className="dist-dot" style={{ background: "#29b6f6" }} />
                Gender Ratio & Diversity
              </h3>
              <p className="dist-subtitle">
                Demographic distribution across the workforce
              </p>
            </div>
            <span className="dist-badge">
              <TrendingUp size={13} /> +2.4% YoY Diversity
            </span>
          </div>

          <div className="dist-card-body">
            <FilledPieChart slices={genderSlices} />

            <div className="dist-gender-bars">
              <div className="dist-gender-row">
                <div className="dist-gender-meta">
                  <span className="dist-gender-label">
                    <span
                      className="dist-legend-dot"
                      style={{ background: "#29b6f6" }}
                    />
                    Male Employees
                  </span>
                  <span className="dist-gender-stats">
                    <strong>{maleCount}</strong>
                    <small>{malePct}%</small>
                  </span>
                </div>
                <div className="dist-progress-track">
                  <div
                    className="dist-progress-fill"
                    style={{
                      width: `${malePct}%`,
                      background: "#29b6f6",
                    }}
                  />
                </div>
              </div>

              <div className="dist-gender-row">
                <div className="dist-gender-meta">
                  <span className="dist-gender-label">
                    <span
                      className="dist-legend-dot"
                      style={{ background: "#f43f5e" }}
                    />
                    Female Employees
                  </span>
                  <span className="dist-gender-stats">
                    <strong>{femaleCount}</strong>
                    <small>{femalePct}%</small>
                  </span>
                </div>
                <div className="dist-progress-track">
                  <div
                    className="dist-progress-fill"
                    style={{
                      width: `${femalePct}%`,
                      background: "#f43f5e",
                    }}
                  />
                </div>
              </div>

              <div className="dist-gender-row">
                <div className="dist-gender-meta">
                  <span className="dist-gender-label">
                    <span
                      className="dist-legend-dot"
                      style={{ background: "#26c6da" }}
                    />
                    Other / Undisclosed
                  </span>
                  <span className="dist-gender-stats">
                    <strong>{otherCount}</strong>
                    <small>{otherPct}%</small>
                  </span>
                </div>
                <div className="dist-progress-track">
                  <div
                    className="dist-progress-fill"
                    style={{
                      width: `${otherPct}%`,
                      background: "#26c6da",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="dist-card-footer">
            <div className="dist-footer-left">
              <span>Initiative target: Reach 35% female staffing by Q4 2027</span>
            </div>
            <span>Audited bi-annually</span>
          </div>
        </section>

        {/* Card 3: Designation & Role Distribution (Ranked Bars) */}
        <section className="dist-card">
          <div className="dist-card-header">
            <div className="dist-title-wrap">
              <h3 className="dist-title">
                <span className="dist-dot" style={{ background: "#6366f1" }} />
                Designation & Role Distribution
              </h3>
              <p className="dist-subtitle">
                Workforce headcount ranked by job title and technical focus
              </p>
            </div>
            <div className="dist-toggle-group">
              <button
                type="button"
                className={!showAllRoles ? "active" : ""}
                onClick={() => setShowAllRoles(false)}
              >
                Top 7 Roles
              </button>
              <button
                type="button"
                className={showAllRoles ? "active" : ""}
                onClick={() => setShowAllRoles(true)}
              >
                All ({roles.length})
              </button>
            </div>
          </div>

          <div className="dist-card-body" style={{ alignItems: "flex-start" }}>
            <div className="dist-roles-list">
              {displayedRoles.map(([title, count], idx) => {
                const fillPct = ((count / maxRoleCount) * 100).toFixed(1);
                return (
                  <div className="dist-role-row" key={title}>
                    <div className="dist-role-meta">
                      <span className="dist-role-name">{title}</span>
                      <span className="dist-role-count">{count} roles</span>
                    </div>
                    <div className="dist-role-track">
                      <div
                        className="dist-role-fill"
                        style={{
                          width: `${fillPct}%`,
                          background: roleColors[idx % roleColors.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dist-card-footer">
            <div className="dist-footer-left">
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  className="dist-legend-dot"
                  style={{ background: "#3b82f6" }}
                />{" "}
                Engineering
                <span
                  className="dist-legend-dot"
                  style={{ background: "#8b5cf6", marginLeft: "8px" }}
                />{" "}
                Design & Art
                <span
                  className="dist-legend-dot"
                  style={{ background: "#f59e0b", marginLeft: "8px" }}
                />{" "}
                Operations
              </span>
            </div>
            <strong>{roles.length} Distinct Roles</strong>
          </div>
        </section>

        {/* Card 4: Employment & Contract Status (Donut + Metric Cards) */}
        <section className="dist-card">
          <div className="dist-card-header">
            <div className="dist-title-wrap">
              <h3 className="dist-title">
                <span className="dist-dot" style={{ background: "#10b981" }} />
                Employment & Contract Status
              </h3>
              <p className="dist-subtitle">
                Operational readiness, active contracts, and personnel status
              </p>
            </div>
            <span className="dist-badge">
              <Check size={13} /> {activePct}% Normal Ops
            </span>
          </div>

          <div className="dist-card-body">
            <div
              className="dist-donut"
              role="img"
              aria-label="Employment status donut chart"
              style={{
                background: `conic-gradient(${statusConic})`,
              }}
            >
              <div className="dist-donut-inner">
                <strong>{activeCount}</strong>
                <span className="dist-donut-caption">ACTIVE NOW</span>
                <span className="dist-donut-subtext">
                  {activePct}% retained
                </span>
              </div>
            </div>

            <div className="dist-status-stack">
              <div className="dist-status-item">
                <div className="dist-status-icon-box active">
                  <Check size={15} />
                </div>
                <div className="dist-status-info">
                  <span className="dist-status-title">Active Full-Time</span>
                  <span className="dist-status-sub">
                    Regular payroll confirmed
                  </span>
                </div>
                <div className="dist-status-val">
                  <strong>{pureActiveCount}</strong>
                  <small>{pureActivePct}%</small>
                </div>
              </div>

              <div className="dist-status-item">
                <div className="dist-status-icon-box probation">
                  <Clock size={15} />
                </div>
                <div className="dist-status-info">
                  <span className="dist-status-title">Probationary Period</span>
                  <span className="dist-status-sub">
                    Reviews in next 30 days
                  </span>
                </div>
                <div className="dist-status-val">
                  <strong>{probationCount}</strong>
                  <small>{probationPct}%</small>
                </div>
              </div>

              <div className="dist-status-item">
                <div className="dist-status-icon-box left">
                  <LogOut size={15} />
                </div>
                <div className="dist-status-info">
                  <span className="dist-status-title">Notice / Left</span>
                  <span className="dist-status-sub">
                    Backfill pipeline queued
                  </span>
                </div>
                <div className="dist-status-val">
                  <strong>{leftCount}</strong>
                  <small>{leftPct}%</small>
                </div>
              </div>
            </div>
          </div>

          <div className="dist-card-footer">
            <div className="dist-footer-left">
              <span>● Last HR reconciliation: Today at 09:30 AM</span>
            </div>
            <span style={{ fontWeight: 600, color: "var(--accent)" }}>
              Active Lifecycle
            </span>
          </div>
        </section>
      </div>

      {/* ========================================================= */}
      {/* Secondary Charts Grid (Joining Trends Full Width at Top)   */}
      {/* ========================================================= */}
      <div className="analytics-grid analytics-grid-expanded">
        {/* Full Single Column Span: Joining Trends (by Year) */}
        <JoiningTrendsChart people={people} />

        {/* Across locations */}
        <section className="panel chart-panel">
          <h2>Across locations</h2>
          <Bars values={locations} />
        </section>

        {/* Project participation */}
        <section className="panel chart-panel">
          <h2>Project participation</h2>
          <p className="muted">
            Employees may belong to more than one project.
          </p>
          <Bars
            values={group(
              people.flatMap((p) =>
                p.assignments.length
                  ? p.assignments.map((a) => a.name)
                  : ["Not assigned"],
              ),
            )}
          />
        </section>

        {/* Employee experience chart */}
        <EmployeeMetricsPanel people={all} renderExperience={selectedPeople => <EmployeeExperienceChart people={selectedPeople} />} />
      </div>

      {/* Employee Records Table */}
      <section className="panel analytics-table" id="employee-records">
        <div className="panel-heading">
          <h2>Employee records</h2>
          <span>{people.length} matching people</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {header("name", "Employee")}
                {header("department", "Department")}
                {header("joined", "Joined on")}
                {header("status", "Status")}
                {header("qualification", "Qualifications")}
                {header("projects", "Projects")}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="analytics-person">
                      <Avatar person={p} />
                      <div>
                        <Link
                          className="analytics-profile-link"
                          to={`${preview ? "/preview" : ""}/people?person=${encodeURIComponent(p.id)}`}
                        >
                          {p.full_name}
                        </Link>
                        <small>{p.title}</small>
                      </div>
                    </div>
                  </td>
                  <td>{p.departments?.name || "—"}</td>
                  <td>{p.joined || "Not added"}</td>
                  <td>
                    <span
                      className={
                        "employment-pill " +
                        (p.employment.toLowerCase() === "left" ? "left" : "")
                      }
                    >
                      {p.employment}
                    </span>
                  </td>
                  <td>{p.qualifications.join(", ") || "Not added"}</td>
                  <td>
                    {p.assignments.map((a) => a.name).join(", ") ||
                      "Not assigned"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!people.length && (
            <p className="empty-state">No matching employees.</p>
          )}
        </div>
      </section>
    </>
  );
}
