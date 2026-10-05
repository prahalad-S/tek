import PeopleDataView from "./profiles/PeopleDataView";
import {
  Table2,
  ChartPie,
  Plus,
  Trash2,
  FilterX,
  ListOrdered,
} from "lucide-react";
import { useCardReflow } from "../components/useCardReflow";
import { usePeopleTransition } from "./profiles/usePeopleTransition";
import { Link, useSearchParams } from "react-router-dom";
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  LayoutGrid,
  List,
  MapPin,
  Mail,
  Phone,
  X,
  ArrowRight,
  ArrowDownAZ,
  ArrowUpAZ,
  Shuffle,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "../app/providers";
import { directoryPeople, previewExtended } from "../lib/profiles";
import { previewEmployees } from "../lib/preview";
import type { Employee } from "../lib/types";
import {
  Avatar,
  PageHeader,
  Loading,
  ErrorState,
  EmptyState,
} from "../components/ui";
import ProfileDetails from "./profiles/ProfileDetails";
const directoryPreview: Employee[] = [
  ...previewEmployees,
  {
    ...previewEmployees[1],
    id: "former-left",
    user_id: null,
    full_name: "Taylor Reed",
    email: "taylor.reed@example.test",
    departure_status: "Left",
    archived_at: "2026-09-01",
  },
  {
    ...previewEmployees[2],
    id: "former-terminated",
    user_id: null,
    full_name: "Robin Blake",
    email: "robin.blake@example.test",
    departure_status: "Terminated",
    archived_at: "2026-09-01",
  },
];
export default function People() {
  const { preview, profile, member } = useAuth();
  const [params, setParams] = useSearchParams();
  const [minimumExperience, setMinimumExperience] = useState(0);
  const { phase, transition, busy: animating } = usePeopleTransition();
  const [randomOrder, setRandomOrder] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [departure, setDeparture] = useState("");
  const [sort, setSort] = useState("name");
  const [view, setView] = useState("grid");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [slots, setSlots] = useState<Employee[]>([]);
  const deferred = search;
  const { reflow, busy: reflowing } = useCardReflow(
    ".directory [data-person-id]",
  );
  const q = useQuery({
    queryKey: ["people-directory", preview],
    queryFn: () =>
      preview
        ? Promise.resolve(
          directoryPreview.map((e) => ({
            ...e,
            joined_on: previewExtended(e).profile.joined_on,
          })),
        )
        : directoryPeople(true),
  });
  const all = useMemo(
    () =>
      (q.data || []).map((e) =>
        preview
          ? {
            ...e,
            joined_on: e.joined_on || previewExtended(e).profile.joined_on,
          }
          : e,
      ),
    [q.data, preview],
  );
  const departments = [
    ...new Set(all.map((p) => p.departments?.name).filter(Boolean)),
  ].sort() as string[];
  const locations = [
    ...new Set(all.map((p) => p.location).filter(Boolean)),
  ].sort();
  const yearsAtWork = (employee: Employee) => {
    if (!employee.joined_on) return null;
    const joined = new Date(employee.joined_on + "T00:00:00");
    return Number.isFinite(+joined)
      ? Math.max(0, (Date.now() - +joined) / (365.2425 * 86400000))
      : null;
  };
  const maximumExperience = Math.max(
    1,
    Math.floor(Math.max(0, ...all.map((e) => yearsAtWork(e) || 0)) * 2) / 2,
  );
  function resetFilters() {
    reflow(() => {
      setSearch("");
      setDepartment("");
      setLocation("");
      setDeparture("");
      setSort("default");
      setMinimumExperience(0);
      setRandomOrder({});
      setParams({});
      resetSelection();
    });
  }
  const filtered = useMemo(
    () =>
      all
        .filter(
          (p) =>
            (departure
              ? p.departure_status?.toLowerCase() === departure
              : !p.archived_at &&
              !["left", "terminated"].includes(
                (p.departure_status || "").toLowerCase(),
              )) &&
            (!department || p.departments?.name === department) &&
            (minimumExperience === 0 ||
              (yearsAtWork(p) !== null &&
                yearsAtWork(p)! >= minimumExperience)) &&
            (params.get("team") !== "mine" ||
              (profile?.department_id
                ? p.department_id === profile.department_id
                : p.user_id === profile?.user_id)) &&
            (!location || p.location === location) &&
            `${p.full_name} ${p.title} ${p.employee_code || ""}`
              .toLowerCase()
              .includes(deferred.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "random"
            ? (randomOrder[a.id] || 0) - (randomOrder[b.id] || 0)
            : sort === "default"
              ? 0
              : sort === "z"
                ? b.full_name.localeCompare(a.full_name)
                : sort === "department"
                  ? (a.departments?.name || "").localeCompare(
                    b.departments?.name || "",
                  ) || a.full_name.localeCompare(b.full_name)
                  : sort === "location"
                    ? a.location.localeCompare(b.location) ||
                    a.full_name.localeCompare(b.full_name)
                    : a.full_name.localeCompare(b.full_name),
        ),
    [
      all,
      departure,
      minimumExperience,
      department,
      location,
      deferred,
      sort,
      randomOrder,
      params,
      profile?.department_id,
    ],
  );
  function resetSelection() {
    setSelected(null);
    setSlots([]);
  }
  function choose(person: Employee) {
    void transition(() => {
      if (selected) {
        setSlots((current) =>
          current.map((p) => (p.id === person.id ? selected : p)),
        );
      } else setSlots(filtered.filter((p) => p.id !== person.id));
      setSelected(person);
    });
  }
  useEffect(() => {
    const id = params.get("person");
    const person = all.find((p) => p.id === id);
    if (person) {
      const group = ["left", "terminated"].includes(
        (person.departure_status || "").toLowerCase(),
      )
        ? person.departure_status!.toLowerCase()
        : "";
      setDeparture(group);
      setSlots(
        all.filter(
          (p) =>
            p.id !== id &&
            (group
              ? p.departure_status?.toLowerCase() === group
              : !p.archived_at &&
              !["left", "terminated"].includes(
                (p.departure_status || "").toLowerCase(),
              )),
        ),
      );
      setSelected(person);
    }
  }, [params, q.data]);
  return (
    <>
      <section
        className={`directory people-phase-${phase === "idle" && reflowing ? "reflowing" : phase}`}
        aria-busy={animating || reflowing}
      >
        <header className="people-heading" inert={animating}>
          <div className="people-heading-copy">
            <div className="eyebrow">
              OUR PEOPLE <span className="count-pill">{filtered.length}</span>
            </div>
            <h1>
              Good people. Great things<span>.</span>
            </h1>
            <p>
              Discover the people, experience and ideas behind Tekzenit.{" "}
              <span>
                {departments.length} departments · {locations.length} locations
              </span>
            </p>
          </div>
          <div className="people-heading-tools">
            {" "}
            <div className="experience-filter">
              <label htmlFor="experience-range">
                <strong className="sr-only">
                  {minimumExperience === 0
                    ? ""
                    : `${minimumExperience}+ yrs`}
                </strong>
                Exp{" "}
              </label>
              <input
                id="experience-range"
                type="range"
                min="0"
                max={maximumExperience}
                step="0.5"
                value={minimumExperience}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  reflow(() => {
                    setMinimumExperience(value);
                    resetSelection();
                  });
                }}
              />
              <span>0 – {maximumExperience} years</span>
            </div>
            <div className="directory-toolbar">
              {" "}
              <div className="search-field">
                <Search size={18} />
                <input
                  aria-label="Search people"
                  placeholder="Search people…"
                  value={search}
                  onChange={(e) => {
                    const value = e.target.value;
                    reflow(() => {
                      resetSelection();
                      setSearch(value);
                    });
                  }}
                />
                {search && (
                  <button
                    aria-label="Clear search"
                    className="icon-button"
                    onClick={() => {
                      reflow(() => {
                        setSearch("");
                        resetSelection();
                      });
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <select
                aria-label="Filter department"
                value={department}
                onChange={(e) => {
                  const value = e.target.value;
                  reflow(() => {
                    resetSelection();
                    setDepartment(value);
                  });
                }}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <select
                aria-label="Filter location"
                value={location}
                onChange={(e) => {
                  const value = e.target.value;
                  reflow(() => {
                    resetSelection();
                    setLocation(value);
                  });
                }}
              >
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
              <select
                aria-label="Filter ex-employees"
                value={departure}
                onChange={(e) => {
                  const value = e.target.value;
                  reflow(() => {
                    resetSelection();
                    setDeparture(value);
                  });
                }}
              >
                <option value="">Ex-Emp</option>
                <option value="left">Left</option>
                <option value="terminated">Terminated</option>
              </select>
            </div>{" "}
            <div className="directory-controls">
              <div className="sort-buttons" aria-label="Sort people">
                {[
                  { id: "name", label: "Ascending", Icon: ArrowDownAZ },
                  { id: "z", label: "Descending", Icon: ArrowUpAZ },
                  { id: "random", label: "Random", Icon: Shuffle },
                  { id: "default", label: "Default order", Icon: ListOrdered },
                ].map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    className="icon-button"
                    aria-label={label}
                    title={label}
                    aria-pressed={sort === id}
                    onClick={() =>
                      reflow(() => {
                        resetSelection();
                        if (id === "random")
                          setRandomOrder(
                            Object.fromEntries(
                              all.map((p) => [p.id, Math.random()]),
                            ),
                          );
                        setSort(id);
                      })
                    }
                  >
                    <Icon size={18} />
                  </button>
                ))}
              </div>
              <button
                className="icon-button"
                aria-label="Reset all filters"
                title="Reset all filters"
                onClick={resetFilters}
              >
                <FilterX size={18} />
              </button>
              <div className="view-toggle">
                <button
                  aria-label="Card view"
                  aria-pressed={view === "grid"}
                  onClick={() =>
                    reflow(() => {
                      resetSelection();
                      setView("grid");
                    })
                  }
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  aria-label="List view"
                  aria-pressed={view === "list"}
                  onClick={() =>
                    reflow(() => {
                      resetSelection();
                      setView("list");
                    })
                  }
                >
                  <List size={18} />
                </button>
                {[
                  { id: "table", label: "Table view", Icon: Table2 },
                  { id: "chart", label: "Chart view", Icon: ChartPie },
                ].map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    aria-label={label}
                    title={label}
                    aria-pressed={view === id}
                    onClick={() => {
                      resetSelection();
                      setView(id);
                    }}
                  >
                    <Icon size={18} />
                  </button>
                ))}
              </div>
            </div>
            {member?.role === "admin" && (
              <Link
                className="icon-button people-add"
                aria-label="Add employee"
                title="Add employee"
                to={`${preview ? "/preview" : ""}/access?new=1`}
              >
                <Plus size={18} />
              </Link>
            )}
            {member?.role === "admin" && (
              <Link
                className="icon-button people-delete"
                aria-label="Delete employee"
                title="Delete employee"
                to={`${preview ? "/preview" : ""}/access?delete=1`}
              >
                <Trash2 size={18} />
              </Link>
            )}
          </div>
        </header>
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : !filtered.length ? (
          <EmptyState
            title="No people match these filters"
            description="Try another location, department or search."
            action={
              <button className="button secondary" onClick={resetFilters}>
                Clear filters
              </button>
            }
          />
        ) : (
          <>
            <>
              {selected ? (
                <div key="explorer" className="people-explorer">
                  <section
                    key={selected.id}
                    className="expanded-person"
                    data-person-id={selected.id}
                  >
                    <button
                      className="icon-button explorer-close"
                      aria-label="Back to all people"
                      onClick={() => void transition(resetSelection)}
                    >
                      <X size={20} />
                    </button>
                    <ProfileDetails employee={selected} />
                  </section>
                  <aside className="avatar-rail" aria-label="Other people">
                    <>
                      {slots.map((person) => (
                        <button
                          key={person.id}
                          className="avatar-tile"
                          data-person-id={person.id}
                          title={person.full_name}
                          aria-label={`View ${person.full_name}`}
                          onClick={() => choose(person)}
                        >
                          <Avatar person={person} size="large" />
                        </button>
                      ))}
                    </>
                  </aside>
                </div>
              ) : view === "table" || view === "chart" ? (
                <PeopleDataView
                  people={filtered}
                  view={view}
                  onSelect={choose}
                />
              ) : (
                <div
                  key="directory"

                  className={`people-grid ${view === "list" ? "people-grid--list" : ""}`}
                >
                  <>
                    {filtered.map((person) => (
                      <article
                        className="person-card"
                        data-person-id={person.id}
                        key={person.id}
                      >
                        <button type="button" className="person-card-main" onClick={() => choose(person)} aria-label={`View ${person.full_name} profile`}>
                          <Avatar person={person} size="large" />
                          <div className="person-info">
                            <h3>{person.full_name}</h3>
                            <p>{person.title || "Team member"}</p>
                            <span className="person-department">
                              {person.departments?.name || "Team member"}
                            </span>
                          </div>
                        </button>
                        <div className="person-card-footer">
                          <span><MapPin size={13} />{person.location || "Location not added"}</span>
                          <div className="person-card-actions">
                            {person.email ? (
                              <a className="person-contact-action" href={`mailto:${person.email}`} aria-label={`Email ${person.full_name}`} title={`Email ${person.full_name}`}><Mail size={15} /></a>
                            ) : (
                              <span className="person-contact-unavailable" title="Email address unavailable"><button type="button" className="person-contact-action" disabled aria-label={`Email unavailable for ${person.full_name}`}><Mail size={15} /></button></span>
                            )}
                            <span className="person-contact-unavailable" title="Calling unavailable — no public work number is configured"><button type="button" className="person-contact-action" disabled aria-label={`Calling unavailable for ${person.full_name}`}><Phone size={15} /></button></span>
                            <button type="button" className="person-profile-action" onClick={() => choose(person)}>View profile <ArrowRight size={13} /></button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </>
                </div>
              )}
            </>
          </>
        )}
      </section>
    </>
  );
}
