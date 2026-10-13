import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../app/providers";
import { client } from "../../lib/supabase";
import { dateKey } from "../../lib/domain";
import { addDays } from "../calendar/domain";
import type { AnalyticsEmployee } from "./data";
import { ErrorState } from "../../components/ui";

type Metric = "leaves" | "hours" | "meetings" | "active" | "left";
const metrics: { value: Metric; label: string }[] = [
  { value: "leaves", label: "Leaves" }, { value: "hours", label: "Work hours" }, { value: "meetings", label: "Meetings" },
  { value: "active", label: "Active" }, { value: "left", label: "Left" },
];
type Activity = { user: string; value: number; date: string };
type Bar = { id: string; name: string; value: number | null };
const dateValid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime());
async function activity(metric: Metric, from: string, to: string, signal: AbortSignal, people: AnalyticsEmployee[]): Promise<Activity[]> {
  const output: Activity[] = [];
  const byUser = new Map(people.filter(p => p.user_id && dateValid(p.joined)).map(p => [p.user_id!, p]));
  for (let offset = 0; ; offset += 500) {
    const query = metric === "hours"
      ? client().from("time_entries").select("id,minutes,work_date,timesheets!inner(user_id)").gte("work_date", from).lte("work_date", to)
      : metric === "leaves"
        ? client().from("leave_requests").select("id,user_id,from_date,to_date,daily_minutes").eq("status", "approved").lte("from_date", to).gte("to_date", from)
        : client().from("events").select("id,name,event_type,category,participants,organizer,status,starts_at,ends_at")
          .lt("starts_at", new Date(`${addDays(to, 1)}T00:00:00`).toISOString()).gte("ends_at", new Date(`${from}T00:00:00`).toISOString());
    const { data, error } = await query.order("id").range(offset, offset + 499).abortSignal(signal);
    if (error) throw error;
    for (const row of (data || []) as any[]) {
      if (metric === "hours") {
        const sheet = Array.isArray(row.timesheets) ? row.timesheets[0] : row.timesheets;
        const employee = byUser.get(sheet?.user_id);
        if (employee && row.work_date >= employee.joined) output.push({ user: sheet.user_id, value: Number(row.minutes) / 60, date: row.work_date });
      } else if (metric === "leaves") {
        const employee = byUser.get(row.user_id); if (!employee) continue;
        const start = [from, row.from_date, employee.joined].sort().at(-1)!;
        const end = [to, row.to_date, dateKey(new Date())].sort()[0];
        // Calendar leave stores a daily duration, including half-days. Count
        // only the portion inside the requested period and after joining.
        if (start <= end) {
          for (let date = start; date <= end; date = addDays(date, 1)) output.push({ user: row.user_id, value: Number(row.daily_minutes ?? 480) / 480, date });
        }
      } else if (/meeting/i.test(`${row.event_type} ${row.category} ${row.name}`) && !/cancel|reject/i.test(row.status || "")) {
        const participants = new Set(`${row.participants || ""};${row.organizer || ""}`.split(/[,;\n]/).map(s => s.trim().toLowerCase()).filter(Boolean));
        for (const person of byUser.values()) if (new Date(row.ends_at) >= new Date(`${person.joined}T00:00:00`) && [person.email, person.full_name, person.user_id].some(value => value && participants.has(value.trim().toLowerCase()))) output.push({ user: person.user_id!, value: 1, date: [from, person.joined, dateKey(new Date(row.starts_at))].sort().at(-1)! });
      }
    }
    if (!data || data.length < 500) break;
  }
  return output;
}
// Deterministic local fixtures. No samples are submitted to the API or stored.
function sampleSeed(id: string) { let value = 0; for (const letter of id) value = (value * 31 + letter.charCodeAt(0)) >>> 0; return value; }
function sampleEmployees(people: AnalyticsEmployee[], today: string): AnalyticsEmployee[] {
  return people.map(person => {
    const seed = sampleSeed(person.id), former = seed % 5 === 0;
    const joined = dateValid(person.joined) && person.joined <= today ? person.joined : addDays(today, -365 * (1 + seed % 8));
    const left = former ? [joined, addDays(today, -(1 + seed % 90))].sort().at(-1)! : "";
    return {
      ...person, joined, left, left_recorded: left, employment: former ? "Left" : "Active",
      location: person.location || ["India", "USA", "UK"][seed % 3],
      departments: person.departments?.name ? person.departments : { name: ["Development", "Design", "Operations"][seed % 3] }
    };
  });
}
function sampleMetric(person: AnalyticsEmployee, metric: Metric, from: string, to: string, today: string) {
  const start = [from, person.joined].sort().at(-1)!;
  const end = [to, today, ...(person.left_recorded ? [person.left_recorded] : [])].sort()[0];
  if (start > end) return 0;
  const seed = sampleSeed(person.id), first = Date.parse(`${start}T00:00:00Z`) / 86400000, last = Date.parse(`${end}T00:00:00Z`) / 86400000;
  let total = 0;
  for (let day = first; day <= last; day++) {
    const weekday = ((day + 4) % 7 + 7) % 7;
    if (weekday === 0 || weekday === 6) continue;
    const leave = (day + seed) % 17 === 0 ? ((day + seed) % 2 ? 0.5 : 1) : 0;
    if (metric === "leaves") total += leave;
    else if (metric === "hours") total += (7 + (day + seed) % 5 / 2) * (1 - leave);
    else if (metric === "meetings" && leave < 1 && (day + seed) % 3 === 0) total += 1 + (seed % 2);
  }
  return Number(total.toFixed(2));
}
export default function EmployeeMetricsPanel({ people, renderExperience }: { people: AnalyticsEmployee[]; renderExperience: (people: AnalyticsEmployee[]) => ReactNode }) {
  const { preview, profile, member } = useAuth();
  const [testData, setTestData] = useState(true);
  const today = dateKey(new Date());
  const chartPeople = useMemo(() => testData ? sampleEmployees(people, today) : people, [people, testData, today]);
  const [experience, setExperience] = useState(true), [metric, setMetric] = useState<Metric>("hours");
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [order, setOrder] = useState("name");
  const [location, setLocation] = useState(""), [employeeId, setEmployeeId] = useState("");
  const locations = [...new Set(chartPeople.map(p => p.location || "Not added"))].sort();
  const locationPeople = useMemo(() => chartPeople.filter(p => !location || (p.location || "Not added") === location), [chartPeople, location]);
  const selectedPeople = useMemo(() => locationPeople.filter(p => !employeeId || p.id === employeeId), [locationPeople, employeeId]);
  const earliest = selectedPeople.map(p => p.joined).filter(dateValid).sort()[0] || today;
  const start = from || earliest, end = to || today;
  const valid = dateValid(start) && dateValid(end) && start <= end;
  const periodActivity = ["hours", "leaves", "meetings"].includes(metric);
  const customPeriod = !!from || !!to;
  const dailyView = !!employeeId && selectedPeople.length === 1;
  const query = useQuery({
    queryKey: ["employee-period-metrics-v3", profile?.user_id, preview, metric, start, end, selectedPeople.map(p => `${p.id}:${p.user_id}:${p.joined}:${p.email}:${p.full_name}`).join("|")],
    queryFn: ({ signal }) => activity(metric, start, end, signal, selectedPeople),
    enabled: !testData && !experience && valid && periodActivity && !preview && !!selectedPeople.length,
  });
  const values = useMemo(() => {
    const rows: Bar[] = [];
    if (dailyView && valid) {
      const person = selectedPeople[0];
      const daily = new Map<string, number>();
      if (periodActivity && !testData) {
        for (const row of query.data || []) if (row.user === person.user_id) daily.set(row.date, (daily.get(row.date) || 0) + row.value * (metric === "leaves" ? 8 : 1));
      } else {
        const first = [start, person.joined].sort().at(-1)!;
        const last = [end, today].sort()[0];
        if (dateValid(first)) for (let date = first; date <= last; date = addDays(date, 1)) {
          const left = person.left_recorded || "";
          const value = periodActivity ? sampleMetric(person, metric, date, date, today) * (metric === "leaves" ? 8 : 1)
            : metric === "active" ? Number(!left || left > date) : Number(left === date);
          if (value > 0) daily.set(date, value);
        }
      }
      for (const [date, value] of daily) rows.push({id:date, name:date, value});
      if (!testData && periodActivity && (!person.user_id || !dateValid(person.joined) || (metric !== "meetings" && member?.role !== "admin" && person.user_id !== profile?.user_id && !daily.size))) rows.push({id:person.id, name:person.full_name, value:null});
    } else if (testData && periodActivity) {
      for (const person of selectedPeople) rows.push({ id: person.id, name: person.full_name, value: sampleMetric(person, metric, start, end, today) });
    } else if (periodActivity) {
      const totals = new Map<string, number>();
      for (const row of query.data || []) totals.set(row.user, (totals.get(row.user) || 0) + row.value);
      for (const person of selectedPeople) {
        // Do not portray a colleague's hidden timesheet as zero activity.
        const permitted = metric === "meetings" || member?.role === "admin" || person.user_id === profile?.user_id || totals.has(person.user_id || "");
        rows.push({ id: person.id, name: person.full_name, value: person.user_id && dateValid(person.joined) && permitted ? totals.get(person.user_id) || 0 : null });
      }
    } else {

      for (const person of selectedPeople) {
        const joined = person.joined, left = person.left_recorded || "";
        if (!dateValid(joined) || joined > end || (person.employment.toLowerCase() === "left" && !left)) continue;
        if (metric === "active" || metric === "left") rows.push({ id: person.id, name: person.full_name, value: metric === "active" ? Number(!left || left > end) : Number(!!left && left >= start && left <= end) });

      }

    }
    return rows.sort((a, b) => order === "name" ? a.name.localeCompare(b.name) : (order === "lowest" ? (a.value ?? Infinity) - (b.value ?? Infinity) : (b.value ?? -1) - (a.value ?? -1)) || a.name.localeCompare(b.name));
  }, [dailyView, valid, testData, today, selectedPeople, query.data, metric, start, end, order, periodActivity, member?.role, profile?.user_id]);
  const max = Math.max(1, ...values.map(row => row.value || 0)), total = values.reduce((sum, row) => sum + (row.value || 0), 0);
  const format = (value: number) => `${Number(value.toFixed(2))}${metric === "hours" || (dailyView && metric === "leaves") ? " h" : metric === "leaves" ? " d" : dailyView && metric === "active" ? " active day" : ""}`;
  const descriptions: Record<Metric, string> = { hours: "Total recorded work hours", leaves: "Approved leave days taken (8 hours = one day; half-days count as 0.5)", meetings: "Recorded calendar meetings with exact participant matches; not verified attendance", active: "Employees active as of the end date", left: "Employees with a recorded departure during the period" };
  return <section className="panel chart-panel employee-experience-panel">
    <header className="employee-metrics-heading">
      <div>
        <h2>Employee statistics</h2>
        <button type="button" className={`button ${experience ? "" : "secondary"}`} aria-pressed={experience} onClick={() => { setExperience(true); setFrom(""); setTo(""); }}>Experience</button>
      </div>
      <div className="employee-metrics-controls">

        <label>Sort<select aria-label="Employee metric" value={experience ? "" : metric} onChange={event => { setMetric(event.target.value as Metric); setExperience(false); }}><option value="" disabled>Sort by…</option>{metrics.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>Location<select value={location} onChange={event => { setLocation(event.target.value); setEmployeeId(""); }}><option value="">All locations</option>{locations.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Employee<select value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="">All employees</option>{[...locationPeople].sort((a, b) => a.full_name.localeCompare(b.full_name)).map(person => <option value={person.id} key={person.id}>{person.full_name}</option>)}</select></label>
        {!experience && <label>Order<select value={order} onChange={event => setOrder(event.target.value)}><option value="highest">Highest first</option><option value="lowest">Lowest first</option><option value="name">Name A–Z</option></select></label>}
        <fieldset aria-label="Date range"><label>From<input type="date" value={from} onChange={event => { setFrom(event.target.value); setExperience(false); }} /></label><label>To<input type="date" value={to} onChange={event => { setTo(event.target.value); setExperience(false); }} /></label></fieldset>
        {customPeriod && <button type="button" className="text-button" onClick={() => { setFrom(""); setTo(""); }}>Since joining</button>}
      </div>
    </header>
    <div className={`employee-metrics-test-banner${testData ? " is-enabled" : ""}`}>
      <span role="status">{testData ? "Test data is ON · fictional entries for every employee · stored only in this view" : "Test data is OFF · showing recorded analytics"}</span>
      <button type="button" className="button secondary" aria-pressed={testData} onClick={() => setTestData(value => !value)}>{testData ? "Remove test data" : "Show test data"}</button>
    </div>
    {experience ? <><p className="muted">Years of experience across {selectedPeople.length} employees.</p>{renderExperience(selectedPeople)}</> : <>
      <p className="muted">{dailyView ? metric === "leaves" ? "Leave hours per leave day" : metric === "hours" ? "Work hours per workday" : metric === "meetings" ? "Meetings per day" : metric === "active" ? "Active employment days" : "Recorded departure day" : descriptions[metric]}. {customPeriod ? `${start} to ${end} (inclusive).` : "From each employee’s joining date through today."}</p>
      {!valid ? <p role="alert">From must be on or before To. Choose valid dates.</p> : !selectedPeople.length ? <p className="muted">No employees match these selections.</p> : !testData && preview && periodActivity ? <p className="muted">Sign in to load recorded leave, hours and meetings.</p> : !testData && query.isError && periodActivity ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : !testData && periodActivity && query.isPending ? <p role="status">Loading recorded activity…</p> : <>
        <p className="employee-metrics-total">{testData ? "Fictional total:" : "Total recorded:"} <strong>{format(total)}</strong></p>
        <div className="employee-metric-columns-scroll" role="region" aria-label="Employee bar chart" tabIndex={0}>
          <div className="employee-metric-columns" data-metric={metric}>
            {values.map(row => <div key={row.id} className="employee-metric-column" title={`${row.name}: ${row.value === null ? "Data unavailable" : format(row.value)}`}>
              <strong>{row.value === null ? "N/A" : format(row.value)}</strong>
              <div className="employee-metric-track"><span className={row.value === null ? "is-unavailable" : ""} style={{ height: row.value === null ? "4px" : `${Math.max(0, row.value / max) * 100}%` }} /></div>
              <small>{row.name}</small>
            </div>)}
          </div>
        </div>
        {!values.length && <p className="muted">No activity or employment dates match this period.</p>}
        {values.some(row => row.value === null) && <small className="muted">N/A means a missing joining date/account or records unavailable to your account; it does not mean zero.</small>}
      </>}
      <small className="muted">{testData ? "All displayed metrics are fictional samples, including employment status. Filters and date ranges apply to these local examples. Remove test data to return to recorded analytics." : "All employees are selected by default. Recorded activity remains subject to your account’s access. Location and department values reflect current assignments."}</small>
    </>}
  </section>;
}
