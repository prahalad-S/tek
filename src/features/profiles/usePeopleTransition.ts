import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
export function usePeopleTransition() {
  const [phase, setPhase] = useState("idle");
  const queued = useRef<(() => void) | null>(null);
  const running = useRef(false),
    alive = useRef(true),
    clones = useRef<HTMLElement[]>([]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clones.current.forEach((n) => n.remove());
    };
  }, []);
  async function transition(change: () => void) {
    if (running.current) {
      queued.current = change;
      return;
    }
    running.current = true;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      change();
      running.current = false;
      return;
    }
    const sources = Array.from(
      document.querySelectorAll<HTMLElement>(".directory [data-person-id]"),
    )
      .map((node) => ({
        id: node.dataset.personId!,
        node: node.querySelector<HTMLElement>(".avatar")!,
      }))
      .filter((x) => x.node)
      .map((x) => ({ ...x, rect: x.node.getBoundingClientRect() }));
    flushSync(() => setPhase("hiding"));
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (!alive.current) return;
    const flights = sources.map(({ id, node, rect }) => {
      const copy = node.cloneNode(true) as HTMLElement;
      const computed = getComputedStyle(node);
      copy.setAttribute("aria-hidden", "true");
      copy.dataset.flightId = id;
      Object.assign(copy.style, {
        position: "fixed",
        boxSizing: "border-box",
        fontSize: computed.fontSize,
        fontFamily: computed.fontFamily,
        fontWeight: computed.fontWeight,
        lineHeight: computed.lineHeight,
        borderWidth: computed.borderWidth,
        borderStyle: "solid",
        borderColor: computed.borderColor,
        transition: "none",
        left: rect.left + "px",
        top: rect.top + "px",
        width: rect.width + "px",
        height: rect.height + "px",
        margin: "0",
        zIndex: "1000",
        pointerEvents: "none",
        opacity: "1",
        visibility: "visible",
        transformOrigin: "top left",
      });
      document.body.appendChild(copy);
      clones.current.push(copy);
      return { id, copy, rect };
    });
    flushSync(() => {
      setPhase("moving");
      change();
    });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    if (!alive.current) return;
    const animations = flights.map(({ id, copy, rect }) => {
      const target = document.querySelector<HTMLElement>(
        `.directory [data-person-id="${CSS.escape(id)}"] .avatar`,
      );
      if (!target) {
        return copy
          .animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 250,
            easing: "linear",
            fill: "forwards",
          })
          .finished.catch(() => {});
      }
      const to = target.getBoundingClientRect();
      const targetStyle = getComputedStyle(target);
      const scale = to.width / rect.width;
      return copy
        .animate(
          [
            {
              transform: "translate(0,0) scale(1)",
              fontSize: copy.style.fontSize,
              borderWidth: copy.style.borderWidth,
            },
            {
              transform: `translate(${to.left - rect.left}px,${to.top - rect.top}px) scale(${scale})`,
              fontSize: `${parseFloat(targetStyle.fontSize) / scale}px`,
              borderWidth: `${parseFloat(targetStyle.borderWidth) / scale}px`,
              borderColor: targetStyle.borderColor,
            },
          ],
          { duration: 500, easing: "linear", fill: "forwards" },
        )
        .finished.catch(() => {});
    });
    await Promise.all(animations);
    if (alive.current) {
      // Reveal the real avatars in the same paint before removing their moving copies.
      flushSync(() => setPhase("revealing"));
      clones.current.forEach((n) => n.remove());
      clones.current = [];
      await new Promise((resolve) => setTimeout(resolve, 360));
      if (alive.current) setPhase("idle");
    }
    running.current = false;
    if (queued.current && alive.current) {
      const next = queued.current;
      queued.current = null;
      void transition(next);
    }
  }
  return { phase, transition, busy: phase !== "idle" };
}
