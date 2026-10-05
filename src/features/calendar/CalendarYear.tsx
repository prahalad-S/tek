import type { ReactNode } from "react";
import { BirthdayIcon } from "../../components/BirthdayIcon";
import {
  calendarRange,
  rangeDays,
  getEntryColor,
  type CalendarEntry,
  type CalendarLeave,
} from "./domain";
import { minutesLabel } from "../../lib/domain";

export default function CalendarYear({
  anchor,
  today,
  dayEntries,
  dayLeaves,
  onSelect,
  onOpenEntry,
  onOpenLeave,
  onOpenDay,
  renderEntry,
  onDrop,
  onContext,
  onLeaveDrag,
  birthdays,
  mode = "detailed",
  compact = false,
  getName,
}: {
  anchor: string;
  today: string;
  dayEntries: (date: string) => CalendarEntry[];
  dayLeaves: (date: string) => CalendarLeave[];
  onSelect: (date: string, view: "month" | "week") => void;
  onOpenEntry?: (entry: CalendarEntry) => void;
  onOpenLeave?: (leave: CalendarLeave) => void;
  onOpenDay?: (date: string) => void;
  renderEntry?: (entry: CalendarEntry) => ReactNode;
  onDrop: (e: React.DragEvent, date: string) => void;
  onContext: (
    e: React.MouseEvent,
    date: string,
    entry?: CalendarEntry,
    leave?: CalendarLeave,
  ) => void;
  onLeaveDrag: (e: React.DragEvent, leave: CalendarLeave) => void;
  birthdays: (date: string) => string[];
  mode?: "detailed" | "bands" | "large";
  compact?: boolean;
  getName?: (userId: string) => string;
}) {
  const currentMode = mode || (compact ? "bands" : "detailed");

  return (
    <div
      className={`calendar-year calendar-year-editable mode-${currentMode} ${compact ? "calendar-bands" : ""}`}
    >
      {Array.from({ length: 12 }, (_, month) => {
        const first = `${anchor.slice(0, 4)}-${String(month + 1).padStart(2, "0")}-01`,
          range = calendarRange(first, "month");
        return (
          <section className="mini-month" key={month}>
            <div className="year-month-heading">
              <button
                className="mini-month-title"
                onClick={() => onSelect(first, "month")}
              >
                {new Date(`${first}T12:00:00`).toLocaleDateString(undefined, {
                  month: "long",
                })}
              </button>
              <span>{String(month + 1).padStart(2, "0")}</span>
            </div>
            <div className="mini-month-grid">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <small key={i}>{d}</small>
              ))}
              {rangeDays(range.from, range.to).map((date) => {
                if (date.slice(0, 7) !== first.slice(0, 7)) {
                  return <div className="blank" key={date} />;
                }

                const entries = dayEntries(date);
                const leaves = dayLeaves(date);
                const birthdayList = birthdays(date);
                const totalItems = entries.length + leaves.length;
                const hasEvents = totalItems > 0;
                const primaryEntry = entries[0];
                const primaryLeave = leaves[0];
                const primaryColor = primaryEntry
                  ? getEntryColor(primaryEntry.project_id)
                  : primaryLeave
                    ? "#10b981"
                    : undefined;

                const birthdayTooltip = birthdayList.length
                  ? birthdayList.map((n) => `${n}'s birthday`).join(", ")
                  : "";

                if (currentMode === "large") {
                  return (
                    <div
                      className={`year-day year-day-large ${date === today ? "today" : ""}`}
                      data-date={date}
                      key={date}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => onDrop(e, date)}
                      onContextMenu={(e) => onContext(e, date, primaryEntry, primaryLeave)}
                    >
                      <button
                        type="button"
                        className={`year-circle-btn ${hasEvents ? "has-entry" : "empty"}`}
                        style={
                          hasEvents && primaryColor
                            ? ({ "--entry-color": primaryColor } as React.CSSProperties)
                            : undefined
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          if (primaryEntry && onOpenEntry) onOpenEntry(primaryEntry);
                          else if (primaryLeave && onOpenLeave) onOpenLeave(primaryLeave);
                          else if (onOpenDay) onOpenDay(date);
                          else onSelect(date, "week");
                        }}
                        title={
                          primaryEntry
                            ? `${getName ? `${getName(primaryEntry.timesheets.user_id)} · ` : ""}${primaryEntry.projects?.name || "Project"}: ${primaryEntry.description} (${minutesLabel(primaryEntry.minutes)})`
                            : `View ${date}`
                        }
                        aria-label={`Date ${date}`}
                      >
                        {Number(date.slice(-2))}

                        {birthdayList.length > 0 && (
                          <span
                            className="year-circle-birthday-badge"
                            title={birthdayTooltip}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenDay) onOpenDay(date);
                            }}
                          >
                            <BirthdayIcon size={11} strokeWidth={1.8} />
                          </span>
                        )}
                      </button>
                    </div>
                  );
                }

                // Modes: "detailed" (color dots) and "bands" (color horizontal bars)
                const maxVisible = 3;
                const visibleEntries = entries.slice(0, maxVisible);
                const remainingSlots = Math.max(0, maxVisible - visibleEntries.length);
                const visibleLeaves = leaves.slice(0, remainingSlots);
                const hiddenCount = totalItems - (visibleEntries.length + visibleLeaves.length);

                return (
                  <div
                    className={`year-day ${date === today ? "today" : ""} ${hasEvents ? "has-events" : ""}`}
                    data-date={date}
                    key={date}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDrop(e, date)}
                    onContextMenu={(e) => onContext(e, date)}
                  >
                    <div className="year-day-header">
                      <button
                        className="year-day-number"
                        aria-label={`View ${date}`}
                        onClick={() => (onOpenDay ? onOpenDay(date) : onSelect(date, "week"))}
                        title={`Open entries for ${date}`}
                      >
                        {Number(date.slice(-2))}
                      </button>

                      {birthdayList.length > 0 && (
                        <span
                          className="year-birthday-badge"
                          title={birthdayTooltip}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenDay) onOpenDay(date);
                          }}
                        >
                          <BirthdayIcon size={11} strokeWidth={1.8} />
                        </span>
                      )}
                    </div>

                    {currentMode === "detailed" ? (
                      <div className="year-day-dots">
                        {visibleEntries.map((entry) => {
                          const owner = getName ? getName(entry.timesheets.user_id) : "";
                          const tooltip = `${owner ? `${owner} · ` : ""}${entry.projects?.name || "Project"}: ${entry.description} (${minutesLabel(entry.minutes)} · ${entry.task_status})`;

                          return (
                            <button
                              key={entry.id}
                              type="button"
                              className="year-entry-dot"
                              style={
                                {
                                  "--entry-color": getEntryColor(entry.project_id),
                                } as React.CSSProperties
                              }
                              title={tooltip}
                              aria-label={tooltip}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData(
                                  "application/tekzenit-entry",
                                  JSON.stringify({ id: entry.id, mode: "move" }),
                                );
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onContextMenu={(e) => onContext(e, date, entry)}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onOpenEntry) onOpenEntry(entry);
                                else onSelect(date, "week");
                              }}
                            />
                          );
                        })}

                        {visibleLeaves.map((l) => {
                          const leaveOwner = getName ? getName(l.user_id) : "";
                          const tooltip = `${leaveOwner ? `${leaveOwner} · ` : ""}${l.leave_type}: ${l.reason} (${minutesLabel(l.daily_minutes)} · ${l.status})`;

                          return (
                            <button
                              key={l.id}
                              type="button"
                              className="year-leave-dot"
                              title={tooltip}
                              aria-label={tooltip}
                              draggable
                              onDragStart={(e) => onLeaveDrag(e, l)}
                              onContextMenu={(e) => onContext(e, date, undefined, l)}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onOpenLeave) onOpenLeave(l);
                                else onSelect(date, "week");
                              }}
                            />
                          );
                        })}

                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            className="year-more-badge"
                            title={`View all ${totalItems} items for ${date}`}
                            aria-label={`View all ${totalItems} items for ${date}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenDay) onOpenDay(date);
                              else onSelect(date, "week");
                            }}
                          >
                            +{hiddenCount}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="year-day-bands">
                        {visibleEntries.map((entry) => {
                          const owner = getName ? getName(entry.timesheets.user_id) : "";
                          const tooltip = `${owner ? `${owner} · ` : ""}${entry.projects?.name || "Project"}: ${entry.description} (${minutesLabel(entry.minutes)} · ${entry.task_status})`;

                          return (
                            <button
                              key={entry.id}
                              type="button"
                              className="year-entry-band"
                              style={
                                {
                                  "--entry-color": getEntryColor(entry.project_id),
                                } as React.CSSProperties
                              }
                              title={tooltip}
                              aria-label={tooltip}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData(
                                  "application/tekzenit-entry",
                                  JSON.stringify({ id: entry.id, mode: "move" }),
                                );
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onContextMenu={(e) => onContext(e, date, entry)}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onOpenEntry) onOpenEntry(entry);
                                else onSelect(date, "week");
                              }}
                            />
                          );
                        })}

                        {visibleLeaves.map((l) => {
                          const leaveOwner = getName ? getName(l.user_id) : "";
                          const tooltip = `${leaveOwner ? `${leaveOwner} · ` : ""}${l.leave_type}: ${l.reason} (${minutesLabel(l.daily_minutes)} · ${l.status})`;

                          return (
                            <button
                              key={l.id}
                              type="button"
                              className="year-leave-band"
                              title={tooltip}
                              aria-label={tooltip}
                              draggable
                              onDragStart={(e) => onLeaveDrag(e, l)}
                              onContextMenu={(e) => onContext(e, date, undefined, l)}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onOpenLeave) onOpenLeave(l);
                                else onSelect(date, "week");
                              }}
                            />
                          );
                        })}

                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            className="year-more-badge"
                            title={`View all ${totalItems} items for ${date}`}
                            aria-label={`View all ${totalItems} items for ${date}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenDay) onOpenDay(date);
                              else onSelect(date, "week");
                            }}
                          >
                            +{hiddenCount}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
