import type { CalendarEntry, CalendarLeave } from "./domain";
import { addDays } from "./domain";
export type CalendarMenuTarget = {
  x: number;
  y: number;
  date: string;
  entry?: CalendarEntry;
  leave?: CalendarLeave;
};
export type CalendarAction = {
  entry?: CalendarEntry;
  leave?: CalendarLeave;
  kind: "move" | "copy" | "extend" | "delete";
  date: string;
};
export default function CalendarContextMenu({
  menu,
  canPaste,
  restricted,
  onAdd,
  onEdit,
  onCopy,
  onPaste,
  onAction,
}: {
  menu: CalendarMenuTarget;
  canPaste: boolean;
  restricted:boolean;
  onAdd: (leave?: boolean) => void;
  onEdit: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onAction: (action: CalendarAction) => void;
}) {
  const hasEntry = !!(menu.entry || menu.leave);
  return (
    <div
      className="calendar-context"
      role="menu"
      aria-label="Calendar actions"
      style={{ left: Math.max(8, menu.x), top: Math.max(8, menu.y) }}
      onClick={(e) => e.stopPropagation()}
    >
      {restricted&&<p className="muted">Access restricted · request an unlock</p>}
      <button role="menuitem" disabled={restricted} onClick={() => onAdd()}>
        Add work
      </button>
      <button role="menuitem" disabled={restricted} onClick={() => onAdd(true)}>
        Add leave
      </button>
      <button role="menuitem" disabled={restricted || !hasEntry} onClick={onEdit}>
        Edit
      </button>
      <button role="menuitem" disabled={restricted || !hasEntry} onClick={onCopy}>
        Copy
      </button>
      <button role="menuitem" disabled={restricted || !canPaste} onClick={onPaste}>
        Paste
      </button>
      <button
        role="menuitem"
        disabled={restricted || !hasEntry}
        onClick={() =>
          onAction({
            entry: menu.entry,
            leave: menu.leave,
            kind: "move",
            date: menu.leave?.from_date || menu.date,
          })
        }
      >
        Move to date
      </button>
      <button
        role="menuitem"
        disabled={restricted || !hasEntry}
        onClick={() =>
          onAction({
            entry: menu.entry,
            leave: menu.leave,
            kind: "extend",
            date: addDays(menu.leave?.to_date || menu.date, 1),
          })
        }
      >
        Repeat through date
      </button>
      <button
        role="menuitem"
        disabled={restricted || !hasEntry}
        onClick={() =>
          onAction({
            entry: menu.entry,
            leave: menu.leave,
            kind: "delete",
            date: menu.date,
          })
        }
      >
        Delete
      </button>
    </div>
  );
}
