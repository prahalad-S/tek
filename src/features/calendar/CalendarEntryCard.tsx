import { MoreHorizontal } from "lucide-react";
import { minutesLabel } from "../../lib/domain";
import { getEntryColor, type CalendarEntry } from "./domain";
export default function CalendarEntryCard({
  entry,
  owner,
  onOpen,
  onMenu,
  onDrag,
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
        } as React.CSSProperties
      }
      draggable
      onDragStart={(e) => {
        if ((e.target as HTMLElement).closest(".entry-resize")) {
          e.preventDefault();
          return;
        }
        onDrag(e);
      }}
      onContextMenu={onMenu}
    >
      <button className="entry-main" onClick={onOpen}>
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
        title="Drag to extend this entry across dates"
        aria-label={`Resize ${entry.description}`}
      />
    </div>
  );
}
