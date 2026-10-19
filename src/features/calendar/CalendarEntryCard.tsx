import { MoreHorizontal } from "lucide-react";
import { minutesLabel } from "../../lib/domain";
import { getEntryColor, type CalendarEntry } from "./domain";
export default function CalendarEntryCard({
  entry,
  owner,
  onOpen,
  onMenu,

  onResize,
}: {
  entry: CalendarEntry;
  owner?: string;
  onOpen: () => void;
  onMenu: (event: React.MouseEvent) => void;
  onDrag: (event: React.DragEvent, mode?: string) => void;
  onResize: (event: React.PointerEvent) => void;
}) {
  return (
    <div
      className="work-entry"
      style={
        {
          "--entry-color": getEntryColor(entry.project_id),
          width: `${Math.min(100, Math.max(12.5, entry.minutes / 480 * 100))}%`,
        } as React.CSSProperties
      }
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={onMenu}
    >
      <button className="entry-main" onPointerDown={onResize} onClick={onOpen}>
        <small>
          {owner ? owner + " · " : ""}
          {entry.projects?.name}
        </small>
        <strong>{entry.description}</strong>
        <span>
          {minutesLabel(entry.minutes)} · {entry.task_status}
        </span>
      </button>
      <button
        className="entry-menu"
        aria-label={`Options for ${entry.description}`}
        onClick={onMenu}
      >
        <MoreHorizontal size={15} />
      </button>
      <button
        type="button"
        className="entry-resize"
        draggable={false}
        onPointerDown={onResize}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        title="Drag to resize: each day is 8 hours; each step is 1 hour"
        aria-label={`Resize ${entry.description}`}
      />
    </div>
  );
}
