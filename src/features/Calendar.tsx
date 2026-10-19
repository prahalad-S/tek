import CalendarSpans from "./calendar/CalendarSpans";
import { automationClick, automationElement, automationWait, type CalendarAutomationDraft } from "../lib/jarvisUiAutomation";
import TimeEntryDetails from "./calendar/TimeEntryDetails";
import { useCalendarResize } from "./calendar/useCalendarResize";
import { previewCalendarCommand } from "./calendar/previewCalendar";
import CalendarExport from "./calendar/CalendarExport";
import DayEntriesModal from "./calendar/DayEntriesModal";
import { Link, useSearchParams } from "react-router-dom";
import CalendarContextMenu, {
  type CalendarMenuTarget as Menu,
  type CalendarAction as Action,
} from "./calendar/CalendarContextMenu";
import CalendarEntryCard from "./calendar/CalendarEntryCard";
import CalendarYear from "./calendar/CalendarYear";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  MoreHorizontal,
  Download,
  LockKeyhole,
  Undo2,
} from "lucide-react";
import { BirthdayIcon } from "../components/BirthdayIcon";
import { useAuth } from "../app/providers";
import { rpc } from "../lib/api";
import {
  dateKey,
  minutesLabel,
  errorMessage,
  downloadCsv,
} from "../lib/domain";
import {
  PageHeader,
  Modal,
  Loading,
  ErrorState,
  Badge,
  useToast,
} from "../components/ui";
import {
  calendarRange,
  rangeDays,
  shiftAnchor,
  addDays,
  type CalendarView,
  type CalendarEntry,
  type CalendarLeave,
} from "./calendar/domain";
import { useCalendarData } from "./calendar/useCalendarData";
import EntryEditor, { type EditingEntry } from "./calendar/EntryEditor";
import { RestrictedDate, CalendarAccessPanel } from "./calendar/CalendarAccess";
import SharedCalendar from "./calendar/SharedCalendar";
export default function Calendar({ automation }: { automation?: { draft: CalendarAutomationDraft; signal: AbortSignal; onReady: (error?: Error) => void; onCancel: () => void; saved?: boolean } } = {}) {
  const { preview, member, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [exportOpen, setExportOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<"detailed" | "bands" | "large">("bands");
  const compact = displayMode !== "detailed";
  useEffect(() => {
    if (params.get("panel")) setSharedOpen(true);
  }, [params]);
  const own = profile?.user_id || "preview";
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(dateKey(new Date()));
  useEffect(() => {
    if (automation) { setView("month"); setAnchor(automation.draft.date); return; }
    const next = params.get("view"), date = params.get("date");
    if (next === "year" || next === "month" || next === "week" || next === "day") setView(next);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date + "T12:00:00").getTime())) setAnchor(date);
  }, [params, automation?.draft.date]);
  const [user, setUser] = useState(own);
  const [sampleData, setSampleData] = useState(
    () => localStorage.getItem("tekzenit-calendar-samples") !== "off",
  );
  const [details, setDetails] = useState<{
    entry?: CalendarEntry;
    leave?: CalendarLeave;
  } | null>(null);
  const isSample = (entry?: CalendarEntry) =>
    !!entry?.id.startsWith("local-sample-");
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<EditingEntry | null>(null);
  const [restricted, setRestricted] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [clipboard, setClipboard] = useState<{
    entry?: CalendarEntry;
    leave?: CalendarLeave;
  } | null>(null);
  const [currentAction, setAction] = useState<Action | null>(null);
  const action = currentAction;
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [sharedOpen, setSharedOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragDate, setDragDate] = useState("");
  const range = calendarRange(anchor, view);
  const data = useCalendarData(range.from, range.to, preview, own);
  useEffect(() => {
    const id = params.get("jarvisEntry");
    if (!id) return;
    const entry = data.entries.data?.find(item => item.id === id);
    if (entry) setDetails({ entry });
  }, [params, data.entries.data]);
  useEffect(() => {
    if (!automation || automation.saved) return;
    if (data.project.isError || data.entries.isError) { automation.onReady(new Error("Calendar data could not be loaded. No entry was saved.")); return; }
    if (!data.project.isSuccess || !data.entries.isSuccess) return;
    const local = new AbortController(), signal = AbortSignal.any([automation.signal,local.signal]);
    void (async () => {
      const day = await automationElement(`[aria-label="View entries ${automation.draft.date}"]`,signal);
      await automationClick(day,signal);
      await automationWait(200,signal);
      const add = await automationElement('[data-jarvis-add-entry]',signal);
      if (!add) throw new Error("The calendar Add work or leave action is unavailable.");
      await automationClick(add,signal);
    })().catch(error => { if (!signal.aborted) automation.onReady(error instanceof Error ? error : new Error("Could not open today's calendar entry")); });
    return () => local.abort();
  }, [automation?.saved,automation?.draft,automation?.signal,data.project.isSuccess,data.entries.isSuccess,data.project.isError,data.entries.isError]);
  useEffect(() => { if (automation?.saved) { setEditing(null); setDayOpen(null); setDetails(null); } },[automation?.saved]);
  const qc = useQueryClient();
  const toast = useToast();
  const resize = useCalendarResize(
    editableDate,
    setRestricted,
    (entry, date, minutes) => void resizeEntry(entry, date, minutes),
  );
  const manage = member?.role !== "employee";
  const today = data.access.data?.today || dateKey(new Date());
  const people = (data.people.data || [])
    .map((p) => ({
      ...p,
      user_id:
        p.user_id ||
        (sampleData && member?.role === "admin"
          ? `local-person-${p.id}`
          : null),
    }))
    .filter(
      (p) =>
        p.user_id &&
        (member?.role === "admin" ||
          p.user_id === own ||
          (manage && p.department_id === member?.department_id)),
    );
  const samples: CalendarEntry[] =
    !preview && sampleData && member?.role === "admin"
      ? people.flatMap((person, index) =>
          rangeDays(range.from, range.to)
            .filter(
              (date) => ![0, 6].includes(new Date(`${date}T12:00:00`).getDay()),
            )
            .map((date, day) => {
              const project =
                data.project.data?.[
                  (index + day) % (data.project.data?.length || 1)
                ];
              return {
                id: `local-sample-${person.id}-${date}`,
                timesheet_id: "local-sample",
                work_date: date,
                project_id: project?.id || "sample-project",
                description: `[TEST] ${["Feature development and review", "Testing and bug fixes", "Planning and documentation", "Design and research"][(index * 7 + day) % 4]}`,
                minutes: (4 + ((index * 3 + day) % 5)) * 60,
                version: 1,
                task_status: (index + day) % 2 ? "Completed" : "In Progress",
                projects: { name: project?.name || "Test project" },
                timesheets: { user_id: person.user_id!, status: "Test data" },
              };
            }),
        )
      : [];
  const rows = [...(data.entries.data || []), ...samples].filter(
    (e) =>
      (!user || e.timesheets.user_id === user) &&
      (!project || e.project_id === project) &&
      (!status || e.task_status === status) &&
      `${e.description} ${e.projects?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const totalRows = rows.filter(
    (entry) =>
      view !== "month" || entry.work_date.slice(0, 7) === anchor.slice(0, 7),
  );
  const internalWork = (entry: CalendarEntry) =>
    /\b(internal|non[ -]?billable|meeting|idle(?: time)?|vacation|leave|training|holiday)\b/i.test(
      entry.projects?.name || "",
    );
  const internalMinutes = totalRows
    .filter(internalWork)
    .reduce((sum, entry) => sum + entry.minutes, 0);
  const billableMinutes = totalRows
    .filter((entry) => !internalWork(entry))
    .reduce((sum, entry) => sum + entry.minutes, 0);
  const hours = (minutes: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
      minutes / 60,
    );
  const leaves = (data.leave.data || []).filter(
    (l) =>
      (!user || l.user_id === user) &&
      (!project || project === "leave") &&
      `${l.leave_type} ${l.reason}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const name = (id: string) =>
    people.find((p) => p.user_id === id)?.full_name || "Team member";
  function refresh() {
    for (const key of [
      "calendar-entries",
      "calendar-leave",
      "calendar-shared",
      "entries",
      "sheet",
      "leave",
      "leave-approvals",
      "approvals",
      "notifications",
      "history",
    ])
      void qc.invalidateQueries({ queryKey: [key] });
  }
  function editableDate(date: string) {
    return (
      date >= (data.access.data?.earliest || addDays(today, -1)) ||
      !!data.access.data?.grants.some(
        (g) => date >= g.from_date && date <= g.to_date,
      )
    );
  }
  function openEntry(
    date: string,
    entry?: CalendarEntry,
    leave?: CalendarLeave,
    kind?: "leave",
  ) {
    setMenu(null);
    if (isSample(entry) || user.startsWith("local-person-")) {
      toast(
        "This is a read-only test record. The employee must activate their account before real work can be added.",
      );
      return;
    }
    if (!editableDate(date)) {
      automation?.onReady(new Error("This calendar date is restricted. No timesheet entry was saved."));
      setRestricted(date);
      return;
    }
    if (leave?.status === "approved") {
      toast("Approved leave is locked. Contact your manager.", "error");
      return;
    }
    setDayOpen(null);
    setEditing({ date, entry, leave, kind });
  }
  function startAction(next: Action) {
    if (isSample(next.entry)) {
      toast("Test entries are read-only. Use Remove test data to clear them.");
      return;
    }
    setDayOpen(null);
    setMenu(null);
    if (
      !editableDate(
        next.entry?.work_date || next.leave?.from_date || next.date,
      ) ||
      !editableDate(next.date)
    ) {
      setRestricted(
        !editableDate(next.date)
          ? next.date
          : next.entry?.work_date || next.leave!.from_date,
      );
      return;
    }
    setAction(next);
  }
  async function resizeEntry(entry: CalendarEntry, date: string, minutes: number) {
    if (busy || isSample(entry)) return;
    setBusy(true);
    const key = ["calendar-entries", range.from, range.to, preview];
    const before = qc.getQueryData<CalendarEntry[]>(key);
    const span = entry.calendar_span_id || crypto.randomUUID();
    const start = entry.calendar_span_start || entry.work_date;
    if(before) {
      const old = before.filter(e => e.id === entry.id || e.calendar_span_id === span);
      const next = before.filter(e => !old.includes(e));
      for(const day of rangeDays(start,date)) {
        const previous = old.find(e => e.work_date === day);
        next.push({...entry,id:previous?.id || crypto.randomUUID(),work_date:day,minutes:day === date ? minutes : 480,calendar_span_id:span,calendar_span_start:start});
      }
      qc.setQueryData(key,next);
    }
    try {
      const args = { p_id: entry.id, p_version: entry.version, p_date: date, p_minutes: minutes };
      if (preview) previewCalendarCommand("resize_calendar_entry", args, own);
      else await rpc("resize_calendar_entry", args);
      refresh();
      toast("Work duration updated.");
      await qc.invalidateQueries({queryKey:key});
    } catch (error) {
      if(before) qc.setQueryData(key,before);
      toast(errorMessage(error).includes("resize_calendar_entry") ? "Calendar resizing needs the latest Supabase migration. No hours were changed." : errorMessage(error), "error");
    } finally { setBusy(false); }
  }  async function perform(targetDate: string, requested?: Action) {
    const action = requested || currentAction;
    if (!action) return;
    if (isSample(action.entry)) {
      toast("Test entries are read-only. Use Remove test data to clear them.");
      return;
    }
    const source =
      action.entry?.work_date || action.leave?.from_date || targetDate;
    if (!editableDate(source) || !editableDate(targetDate)) {
      setRestricted(!editableDate(source) ? source : targetDate);
      setAction(null);
      return;
    }
    const command = async (name: string, args: Record<string, any>) =>
      preview ? previewCalendarCommand(name, args, own) : rpc(name, args);
    setBusy(true);
    try {
      if (action.leave) {
        if (action.kind === "delete")
          await command("delete_calendar_leave", {
            p_id: action.leave.id,
            p_version: action.leave.version,
          });
        else
          await command("calendar_leave_action", {
            p_id: action.leave.id,
            p_version: action.leave.version,
            p_action: action.kind,
            p_date: targetDate,
          });
      } else
        await command("calendar_entry_action", {
          p_id: action.entry!.id,
          p_version: action.entry!.version,
          p_action: action.kind,
          p_date: action.kind === "delete" ? null : targetDate,
        });
      refresh();
      setAction(null);
      toast("Calendar updated.");
    } catch (error) {
      if (errorMessage(error).includes("Restricted date")) {
        setAction(null);
        setRestricted(targetDate);
      } else toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const buttons = Array.from(
          document.querySelectorAll<HTMLButtonElement>(
            ".calendar-context button:not(:disabled)",
          ),
        );
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        buttons[
          (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
            buttons.length
        ]?.focus();
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", key);
    document
      .querySelector<HTMLButtonElement>(
        ".calendar-context button:not(:disabled)",
      )
      ?.focus();
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", key);
    };
  }, [menu]);
  function context(
    event: React.MouseEvent,
    date: string,
    entry?: CalendarEntry,
    leave?: CalendarLeave,
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (isSample(entry)) {
      setDetails({ entry });
      return;
    }
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - 215),
      y: Math.min(event.clientY, window.innerHeight - 310),
      date,
      entry,
      leave,
    });
  }
  function drag(event: React.DragEvent, entry: CalendarEntry, mode = "move") {
    event.stopPropagation();
    if (isSample(entry)) {
      event.preventDefault();
      return;
    }
    if (!editableDate(entry.work_date)) {
      event.preventDefault();
      setRestricted(entry.work_date);
      return;
    }
    event.dataTransfer.setData(
      "application/tekzenit-entry",
      JSON.stringify({ id: entry.id, mode }),
    );
    event.dataTransfer.effectAllowed = mode === "move" ? "move" : "copy";
  }
  function drop(event: React.DragEvent, date: string) {
    event.preventDefault();
    setDragDate("");
    try {
      const value = JSON.parse(
        event.dataTransfer.getData("application/tekzenit-entry"),
      );
      const entry = rows.find((r) => r.id === value.id);
      const leave = leaves.find((l) => l.id === value.leaveId);
      if (leave)
        void perform(date, {
          leave,
          kind: value.mode === "extend" ? "extend" : "move",
          date,
        });
      else if (entry && entry.work_date !== date)
        void perform(date, {
          entry,
          kind: value.mode === "extend" ? "extend" : "move",
          date,
        });
    } catch {
      toast("Choose a calendar entry to move.", "error");
    }
  }
  const dayEntries = (date: string) => {
    const entries = rows.filter((e) => e.work_date === date);
    if (user) return entries;
    // Show different people before showing a second entry from the same person.
    const groups = new Map<string, CalendarEntry[]>();
    for (const entry of entries)
      groups.set(entry.timesheets.user_id, [
        ...(groups.get(entry.timesheets.user_id) || []),
        entry,
      ]);
    const queues = [...groups.entries()]
      .sort(([a], [b]) => name(a).localeCompare(name(b)))
      .map(([, group]) => [...group]);
    const offset = queues.length ? Number(date.slice(-2)) % queues.length : 0;
    const ordered = [...queues.slice(offset), ...queues.slice(0, offset)];
    const result: CalendarEntry[] = [];
    while (ordered.some((group) => group.length))
      for (const group of ordered) {
        const entry = group.shift();
        if (entry) result.push(entry);
      }
    return result;
  };
  const dayLeaves = (date: string) =>
    leaves.filter((l) => l.from_date <= date && l.to_date >= date);
  const events = (date: string) =>
    (data.shared.data?.events || []).filter(
      (e) =>
        dateKey(new Date(e.starts_at)) <= date &&
        dateKey(new Date(e.ends_at)) >= date,
    );
  const holidays = (date: string) =>
    (data.shared.data?.holidays || []).filter((h) => h.day === date);
  const birthdayNames = (date: string) =>
    (data.birthdays.data || [])
      .filter((b) => b.birthday === date)
      .map((b) => b.full_name);
  function entryNode(entry: CalendarEntry) {
    return (
      <CalendarEntryCard
        key={entry.id}
        entry={entry}
        owner={!user ? name(entry.timesheets.user_id) : undefined}
        onOpen={() => setDetails({ entry })}
        onMenu={(e) => context(e, entry.work_date, entry)}
        onDrag={(e, mode) => drag(e, entry, mode)}
        onResize={(e) => {
          if (isSample(entry)) {
            e.preventDefault();
            return;
          }
          resize.begin(e, entry);
        }}
      />
    );
  }
  function dayCell(date: string) {
    const dayRows = dayEntries(date);
    const dayLeave = dayLeaves(date);
    const work = dayRows.reduce((sum, e) => sum + e.minutes, 0);
    const approved = dayLeave
      .filter((l) => l.status === "approved")
      .reduce((sum, l) => sum + l.daily_minutes, 0);
    const progress = work + approved;
    return (
      <section
        className={`work-calendar-day ${date === today ? "today" : ""} ${date.slice(0, 7) !== anchor.slice(0, 7) && view === "month" ? "outside-month" : ""} ${dragDate === date ? "drag-target" : ""}`}
        data-date={date}
        key={date}
        onContextMenu={(e) => context(e, date)}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = editableDate(date) ? "move" : "none";
          setDragDate(editableDate(date) ? date : "");
        }}
        onDragLeave={() => setDragDate("")}
        onDrop={(e) => drop(e, date)}
      >
        <header>
          <button
            className="day-number"
            aria-label={`View entries ${date}`}
            onClick={() => setDayOpen(date)}
          >
            {Number(date.slice(-2))}
          </button>
          {!editableDate(date) && (
            <LockKeyhole size={12} aria-label="Restricted date" />
          )}
          <button
            className={`day-total ${progress >= 480 ? "complete" : progress >= 240 ? "partial" : progress ? "started" : date <= today ? "missing" : ""}`}
            onClick={() => setDayOpen(date)}
            title={`${minutesLabel(work)} work; ${minutesLabel(approved)} approved leave`}
          >
            {progress
              ? minutesLabel(progress)
              : date <= today
                ? "No entries"
                : "—"}
          </button>
        </header>
        {Array.from(new Set(rows.filter(e => {
          if (!e.calendar_span_id) return false;
          const dates = rangeDays(range.from, range.to);
          const columns = view === "day" ? 1 : 7;
          return Math.floor(dates.indexOf(e.work_date) / columns) === Math.floor(dates.indexOf(date) / columns);
        }).map(e => e.calendar_span_id!))).sort().map(id => <div key={id} data-span-slot={id} className="calendar-span-slot" />)}
        {holidays(date).map((h) => (
          <button
            key={h.id}
            className="calendar-holiday"
            onClick={() => setSharedOpen(true)}
          >
            {h.name}
          </button>
        ))}
        {events(date).map((e) => (
          <button
            key={e.id}
            className="calendar-shared-event"
            onClick={() => setSharedOpen(true)}
          >
            {e.name}
          </button>
        ))}
        {birthdayNames(date).map((person) => (
          <span className="birthday-entry" key={person}>
            <BirthdayIcon
              size={13}
              strokeWidth={1.8}
              style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }}
            />
            {person}
          </span>
        ))}
        {dayRows.filter(e => !e.calendar_span_id).slice(0, view === "day" ? 1000 : view === "week" ? 5 : 2).map(entryNode)}
        {dayLeave.slice(0, 2).map((l) => (
          <button
            key={l.id}
            className="calendar-leave"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(
                "application/tekzenit-entry",
                JSON.stringify({ leaveId: l.id, mode: "move" }),
              );
            }}
            onContextMenu={(e) => context(e, date, undefined, l)}
            onClick={() => setDetails({ leave: l })}
          >
            {l.leave_type} · {minutesLabel(l.daily_minutes)}
            <small>
              {l.status}
              {!user ? " · " + name(l.user_id) : ""}
            </small>
          </button>
        ))}
        {dayRows.length > (view === "day" ? 1000 : view === "week" ? 5 : 2) || dayLeave.length > 2 ? (
          <button className="more-entries" onClick={() => setDayOpen(date)}>
            View all {dayRows.length + dayLeave.length} entries
          </button>
        ) : null}
        <button
          className="day-add"
          aria-label={`Add work or leave ${date}`}
          onClick={() => openEntry(date)}
        >
          <Plus size={12} />
        </button>
      </section>
    );
  }
  const pending =
    data.entries.isPending ||
    data.leave.isPending ||
    data.shared.isPending ||
    data.access.isPending;
  const error =
    data.entries.error ||
    data.leave.error ||
    data.shared.error ||
    data.access.error;
  return (
    <>
      <PageHeader
        eyebrow="YOUR TIME, YOUR PERSPECTIVE"
        title="Your work calendar"
        description="Plan your days, record your work and keep time off in view."
        actions={
          <>
            <button
              className="button secondary"
              onClick={() => setSharedOpen(true)}
            >
              Events & holidays
            </button>
            <button className="button" onClick={() => openEntry(today)}>
              <Plus size={16} />
              Add entry
            </button>
          </>
        }
      />
      <div className="calendar-toolbar">
        <div className="week-nav">
          <button
            className="icon-button"
            aria-label="Previous period"
            onClick={() => setAnchor(shiftAnchor(anchor, view, -1))}
          >
            <ArrowLeft size={18} />
          </button>
          <button className="button secondary" onClick={() => setAnchor(today)}>
            Today
          </button>
          <button
            className="icon-button"
            aria-label="Next period"
            onClick={() => setAnchor(shiftAnchor(anchor, view, 1))}
          >
            <ArrowRight size={18} />
          </button>
        </div>
        <select
          aria-label="Calendar month"
          value={Number(anchor.slice(5, 7)) - 1}
          onChange={(e) => {
            setAnchor(
              `${anchor.slice(0, 4)}-${String(Number(e.target.value) + 1).padStart(2, "0")}-01`,
            );
            if (view === "year") setView("month");
          }}
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i}>
              {new Date(2026, i, 1).toLocaleDateString(undefined, {
                month: "long",
              })}
            </option>
          ))}
        </select>
        <input
          aria-label="Calendar year"
          type="number"
          min="2000"
          max="2100"
          value={Number(anchor.slice(0, 4))}
          onChange={(e) => {
            const y = Number(e.target.value);
            if (y >= 2000 && y <= 2100)
              setAnchor(`${y}-${anchor.slice(5, 7)}-01`);
          }}
        />
        <div className="calendar-mode">
          <label>
            <input
              type="radio"
              name="calendar-mode"
              checked={displayMode === "detailed"}
              onChange={() => setDisplayMode("detailed")}
            />
            Detailed
          </label>
          <label>
            <input
              type="radio"
              name="calendar-mode"
              checked={displayMode === "bands"}
              onChange={() => setDisplayMode("bands")}
            />
            Color bands
          </label>
          {view === "year" && (
            <label>
              <input
                type="radio"
                name="calendar-mode"
                checked={displayMode === "large"}
                onChange={() => setDisplayMode("large")}
              />
              Large view
            </label>
          )}
          <button
            className="icon-button"
            aria-label="Undo last calendar change"
            title="Undo last calendar change"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (preview)
                  previewCalendarCommand("undo_calendar_change", {}, own);
                else await rpc("undo_calendar_change");
                refresh();
                toast("Last calendar change undone.");
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Undo2 size={19} />
          </button>
        </div>
        <div className="view-toggle" aria-label="Calendar view">
          {(["day", "week", "month", "year"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              className={view === v ? "active" : ""}
              onClick={() => setView(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="calendar-filters">
        <input
          aria-label="Search calendar"
          placeholder="Search entries…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {manage && (
          <select
            aria-label="Calendar employee"
            value={user}
            onChange={(e) => setUser(e.target.value)}
          >
            <option value="">All authorized employees</option>
            <option value={own}>My calendar</option>
            {people
              .filter((p) => p.user_id !== own)
              .map((p) => (
                <option key={p.id} value={p.user_id!}>
                  {p.full_name}
                </option>
              ))}
          </select>
        )}
        <select
          aria-label="Calendar project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">All Projects</option>
          {data.project.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="leave">Leave</option>
        </select>
        <select
          aria-label="Task status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option>Pending</option>
          <option>In Progress</option>
          <option>Completed</option>
        </select>
        <button
          className="button secondary small"
          onClick={() => setLeaveOpen(true)}
        >
          Leave overview
        </button>
        <button
          className="button secondary small"
          onClick={() => setAccessOpen(true)}
        >
          Editing access
        </button>
        <button
          className="icon-button"
          aria-label="Export calendar"
          onClick={() => setExportOpen(true)}
        >
          <Download size={17} />
        </button>
      </div>
      {!preview && member?.role === "admin" && (
        <div
          className="panel"
          style={{
            padding: "10px 16px",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>
            {sampleData
              ? "Test data is ON · fictional entries for every employee · stored only in this view"
              : "Test data is off · showing saved records only"}
          </span>
          <button
            className="button secondary small"
            onClick={() => {
              const enabled = !sampleData;
              setSampleData(enabled);
              localStorage.setItem(
                "tekzenit-calendar-samples",
                enabled ? "on" : "off",
              );
              setUser("");
            }}
          >
            {sampleData ? "Remove test data" : "Show test data"}
          </button>
        </div>
      )}
      <Modal
        open={!!details}
        onClose={() => setDetails(null)}
        title={details?.leave ? "Leave details" : "Time entry details"}
        description="View the full record. Viewing does not change the timesheet."
      >
        {details?.entry && (
          <TimeEntryDetails
            entry={details.entry}
            employee={people.find(
              (person) => person.user_id === details.entry!.timesheets.user_id,
            )}
            editable={editableDate(details.entry.work_date)}
            sample={isSample(details.entry)}
            onClose={() => setDetails(null)}
            onEdit={() => {
              const entry = details.entry!;
              setDetails(null);
              openEntry(entry.work_date, entry);
            }}
            onDelete={() => {
              const entry = details.entry!;
              setDetails(null);
              startAction({ entry, kind: "delete", date: entry.work_date });
            }}
          />
        )}
        {details?.leave && (
          <dl className="entry-details">
            <dt>Employee</dt>
            <dd>{name(details.leave.user_id)}</dd>
            <dt>Dates</dt>
            <dd>
              {details.leave.from_date} – {details.leave.to_date}
            </dd>
            <dt>Type</dt>
            <dd>{details.leave.leave_type}</dd>
            <dt>Hours per day</dt>
            <dd>{minutesLabel(details.leave.daily_minutes)}</dd>
            <dt>Status</dt>
            <dd>{details.leave.status}</dd>
            <dt>Reason</dt>
            <dd>{details.leave.reason}</dd>
          </dl>
        )}
      </Modal>
      <div className="calendar-legend">
        <span>
          <i className="complete" />
          8h+ recorded
        </span>
        <span>
          <i className="partial" />
          4–8h
        </span>
        <span>
          <i className="started" />
          Under 4h
        </span>
        <span>
          <i className="missing" />
          No entries
        </span>
        <span
          className="calendar-hour-summary"
          title="Work-hour classification by project name: Internal, Non-Billable, Meeting, Idle Time, Vacation, Leave, Training and Holiday are non-billable. Other projects are treated as billable. Totals follow the selected period and filters; leave requests are excluded."
        >
          Total Billable: <strong>{hours(billableMinutes)} hrs</strong>
        </span>
        <span className="calendar-hour-summary">
          Non-billable / Internal: <strong>{hours(internalMinutes)} hrs</strong>
        </span>
        <div className="calendar-submit-summary">
          <span>
            Total:{" "}
            <strong>{hours(billableMinutes + internalMinutes)} hrs</strong>
          </span>
          <Link
            to={`${preview ? "/preview" : ""}/timesheets`}
            title="Review your saved weekly entries before submitting. Test entries are never submitted."
          >
            Submit Timesheet for Approval →
          </Link>
        </div>
      </div>
      {error ? (
        <ErrorState error={error} retry={refresh} />
      ) : pending ? (
        <Loading />
      ) : view === "year" ? (
        <CalendarYear
          anchor={anchor}
          today={today}
          dayEntries={dayEntries}
          dayLeaves={dayLeaves}
          onOpenEntry={(entry) => setDetails({ entry })}
          onOpenLeave={(leave) => setDetails({ leave })}
          onOpenDay={(date) => setDayOpen(date)}
          renderEntry={entryNode}
          onDrop={drop}
          onContext={context}
          birthdays={birthdayNames}
          mode={displayMode}
          compact={displayMode !== "detailed"}
          getName={name}
          onLeaveDrag={(e, l) => {
            if (!editableDate(l.from_date)) {
              e.preventDefault();
              setRestricted(l.from_date);
              return;
            }
            e.dataTransfer.setData(
              "application/tekzenit-entry",
              JSON.stringify({ leaveId: l.id, mode: "move" }),
            );
          }}
          onSelect={(date, next) => {
            setAnchor(date);
            setView(next);
          }}
        />
      ) : (
        <div className="calendar-scroll">
          <div className={`work-calendar ${view}`}>
            <div className="calendar-weekdays">
              {(view === "day" ? [new Date(anchor + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" })] : [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
              ]).map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div
              className={`work-calendar-grid ${compact ? "calendar-bands" : ""}`}
            >
              {rangeDays(range.from, range.to).map(dayCell)}
              <CalendarSpans entries={rows} renderEntry={entryNode} />
            </div>
          </div>
        </div>
      )}
      {resize.overlay}
      {data.birthdays.error && (
        <p className="field-error">
          Birthday calendar needs the latest database update.
        </p>
      )}
      {menu && (
        <CalendarContextMenu
          menu={menu}
          canPaste={!!clipboard}
          restricted={!editableDate(menu.date)}
          onAdd={(leave) =>
            openEntry(
              menu.date,
              undefined,
              undefined,
              leave ? "leave" : undefined,
            )
          }
          onEdit={() => openEntry(menu.date, menu.entry, menu.leave)}
          onCopy={() => {
            if (!editableDate(menu.date)) setRestricted(menu.date);
            else {
              setClipboard({ entry: menu.entry, leave: menu.leave });
              toast("Entry copied. Choose a date to paste.");
            }
            setMenu(null);
          }}
          onPaste={() =>
            clipboard &&
            startAction({ ...clipboard, kind: "copy", date: menu.date })
          }
          onAction={startAction}
        />
      )}
      {exportOpen && (
        <CalendarExport
          from={range.from}
          to={range.to}
          preview={preview}
          user={user}
          onClose={() => setExportOpen(false)}
        />
      )}
      {editing && (
        <EntryEditor
          editing={editing}
          automation={automation}
          onClose={() => { setEditing(null); automation?.onCancel(); }}
          onSaved={refresh}
          onRestricted={setRestricted}
          canEditDate={editableDate}
          people={people}
          projects={data.project.data || []}
          selectedUser={
            editing.entry?.timesheets.user_id ||
            editing.leave?.user_id ||
            user ||
            own
          }
        />
      )}
      {restricted && (
        <RestrictedDate date={restricted} onClose={() => setRestricted(null)} />
      )}
      <Modal
        open={!!action}
        onClose={() => setAction(null)}
        title={
          action?.kind === "delete"
            ? "Delete this entry?"
            : action?.kind === "extend"
              ? action.leave
                ? "Extend this leave request?"
                : "Repeat work across dates?"
              : action?.kind === "copy"
                ? "Paste this entry?"
                : "Move this entry?"
        }
        description={
          action?.kind === "extend"
            ? action.leave
              ? "Extending a leave request sends it for review again."
              : "This creates the same duration on every date through the end date. Confirm that you actually worked those hours."
            : "Changes apply to authorized dates. Editing previously submitted work reopens its timesheet."
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(
              String(new FormData(e.currentTarget).get("date") || action?.date),
            );
          }}
        >
          <p>{action?.entry?.description || action?.leave?.reason}</p>
          {action?.kind !== "delete" && (
            <label>
              {action?.kind === "extend"
                ? "Repeat through"
                : "Destination date"}
              <input
                name="date"
                type="date"
                defaultValue={action?.date}
                required
              />
            </label>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setAction(null)}
            >
              Cancel
            </button>
            <button
              className={`button ${action?.kind === "delete" ? "danger" : ""}`}
              disabled={busy}
            >
              Confirm {action?.kind}
            </button>
          </div>
        </form>
      </Modal>
      <DayEntriesModal
        open={!!dayOpen}
        date={dayOpen}
        entries={dayOpen ? dayEntries(dayOpen) : []}
        leaves={dayOpen ? dayLeaves(dayOpen) : []}
        getName={name}
        onClose={() => setDayOpen(null)}
        onAddEntry={() => {
          if (dayOpen) openEntry(dayOpen);
        }}
        onViewEntry={(entry) => {
          setDayOpen(null);
          setDetails({ entry });
        }}
        onDeleteEntry={(entry) => {
          if (dayOpen) startAction({ entry, kind: "delete", date: dayOpen });
        }}
        onViewLeave={(leave) => {
          setDayOpen(null);
          setDetails({ leave });
        }}
        onDeleteLeave={(leave) => {
          if (dayOpen) startAction({ leave, kind: "delete", date: dayOpen });
        }}
      />
      <Modal
        open={accessOpen}
        onClose={() => setAccessOpen(false)}
        title="Editing permissions"
        wide
      >
        <CalendarAccessPanel />
      </Modal>
      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Leave overview"
        description="Leave requests overlapping the selected period."
      >
        {leaves.length ? (
          leaves.map((l) => (
            <article key={l.id} className="career-row">
              <h3>{name(l.user_id)}</h3>
              <p>
                {l.from_date} — {l.to_date}
              </p>
              <Badge>{l.leave_type}</Badge>
              <Badge>{minutesLabel(l.daily_minutes)} / day</Badge>
              <Badge>{l.status}</Badge>
              <p>{l.reason}</p>
            </article>
          ))
        ) : (
          <p>No leave requests for this period.</p>
        )}
      </Modal>
      {sharedOpen && (
        <SharedCalendar
          events={data.shared.data?.events || []}
          holidays={data.shared.data?.holidays || []}
          people={data.people.data || []}
          onClose={() => {
            setSharedOpen(false);
            setParams({});
          }}
          onSaved={refresh}
        />
      )}
    </>
  );
}
