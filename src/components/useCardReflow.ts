import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
// Move complete cards without scaling or fading their contents.
export function useCardReflow(selector: string) {
  const [busy, setBusy] = useState(false);
  const active = useRef<Animation[]>([]),
    generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      active.current.forEach((a) => a.cancel());
    },
    [],
  );
  function reflow(change: () => void) {
    const id = ++generation.current;
    const nodes = () =>
      Array.from(document.querySelectorAll<HTMLElement>(selector));
    const key = (n: HTMLElement) =>
      n.dataset.personId || n.dataset.projectId || "";
    const before = new Map(
      nodes().map((n) => [key(n), n.getBoundingClientRect()]),
    );
    active.current.forEach((a) => a.cancel());
    active.current = [];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    flushSync(() => {
      change();
      setBusy(!reduced);
    });
    if (reduced) return;
    const started = document.timeline.currentTime;
    active.current = nodes().map((node) => {
      const to = node.getBoundingClientRect(),
        from = before.get(key(node));
      const animation = node.animate(
        [
          {
            easing: "linear",
            transform: `translate(${from ? from.left - to.left : 0}px,${from ? from.top - to.top : 12}px)`,
          },
          { transform: "translate(0,0)", easing: "linear" },
        ],
        { duration: 500, easing: "linear", fill: "both" },
      );
      animation.startTime = started;
      return animation;
    });
    void Promise.all(
      active.current.map((a) => a.finished.catch(() => {})),
    ).then(() => {
      if (id === generation.current) {
        active.current.forEach((a) => a.cancel());
        active.current = [];
        setBusy(false);
      }
    });
  }
  return { reflow, busy };
}
