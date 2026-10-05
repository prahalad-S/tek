import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CalendarEntry } from "./domain";
import { rangeDays } from "./domain";
const entryLabel = (date: string) => `Extend through ${date}`;
export function useCalendarResize(
  canEdit: (date: string) => boolean,
  onRestricted: (date: string) => void,
  onCommit: (entry: CalendarEntry, date: string) => void,
) {
  const [preview, setPreview] = useState<{
    date: string;
    from: string;
    background: string;
    color: string;
    height: number;
    rects: { left: number; top: number; width: number }[];
  } | null>(null);
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);
  function begin(event: React.PointerEvent, entry: CalendarEntry) {
    event.preventDefault();
    event.stopPropagation();
    if (!canEdit(entry.work_date)) {
      onRestricted(entry.work_date);
      return;
    }
    cleanup.current();
    const source = event.currentTarget.closest(".work-entry")!;
    const origin = source.getBoundingClientRect();
    const appearance = getComputedStyle(source);
    const background = appearance.background;
    const color = appearance.color;
    let target = entry.work_date;
    let moved = false;
    const move = (e: PointerEvent) => {
      moved = true;
      const cell = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-date]");
      const date = cell?.dataset.date;
      if (date) target = date;
      const valid =
        target >= entry.work_date &&
        rangeDays(entry.work_date, target).length <= 32;
      const dates = valid
        ? rangeDays(entry.work_date, target)
        : [entry.work_date];
      const groups = new Map<
        number,
        { left: number; right: number; top: number }
      >();
      for (const d of dates) {
        const n = document.querySelector<HTMLElement>(
          `[data-date="${d}"]:not(.blank)`,
        );
        if (!n) continue;
        const r = n.getBoundingClientRect();
        const key = Math.round(r.top);
        const row = groups.get(key);
        if (row) {
          row.left = Math.min(row.left, r.left + 4);
          row.right = Math.max(row.right, r.right - 4);
        } else
          groups.set(key, {
            left: d === entry.work_date ? origin.left : r.left + 4,
            right: r.right - 4,
            top: d === entry.work_date ? origin.top : r.top + 30,
          });
      }
      // Clip the final row at the pointer, rather than snapping to the cell edge.
      const targetNode = document.querySelector<HTMLElement>(
        `[data-date="${target}"]:not(.blank)`,
      );
      if (targetNode) {
        const bounds = targetNode.getBoundingClientRect();
        const row = groups.get(Math.round(bounds.top));
        if (row)
          row.right = Math.max(
            row.left + 1,
            Math.min(bounds.right - 4, e.clientX),
          );
      }
      const rects = [...groups.values()].map((r) => ({
        left: r.left,
        top: r.top,
        width: r.right - r.left,
      }));
      if (rects.length === 1 && target === entry.work_date)
        rects[0].width = Math.max(origin.width, e.clientX - origin.left);
      setPreview({
        from: entry.work_date,
        date: target,
        rects,
        background,
        color,
        height: origin.height,
      });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      document.body.classList.remove("calendar-is-resizing");
      setPreview(null);
    };
    const up = () => {
      stop();
      if (
        !moved ||
        target <= entry.work_date ||
        rangeDays(entry.work_date, target).length > 32
      )
        return;
      if (!canEdit(target)) {
        onRestricted(target);
        return;
      }
      onCommit(entry, target);
    };
    const cancel = () => stop();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    cleanup.current = stop;
    document.body.classList.add("calendar-is-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
    window.addEventListener("keydown", key);
  }
  return {
    begin,
    preview,
    overlay: preview
      ? createPortal(
          <div className="resize-overlay" aria-live="polite">
            {preview.rects.map((r, i) => (
              <div
                className="resize-ghost"
                key={i}
                style={{
                  left: r.left,
                  top: r.top,
                  width: r.width,
                  background: preview.background,
                  color: preview.color,
                  height: preview.height,
                }}
              >
                {i === 0 ? entryLabel(preview.date) : "Continued"}
              </div>
            ))}
          </div>,
          document.body,
        )
      : null,
  };
}
