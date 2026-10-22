import { useEffect, useRef, useState } from "react";
import { Check, Palette, Search, X } from "lucide-react";
import { themeOptions } from "./themes";
import { useTheme } from "./providers";

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const selected = theme === "system" ? document.documentElement.dataset.theme : theme;
  const options = themeOptions.filter(option => `${option.label} ${option.value}`.toLowerCase().includes(query.trim().toLowerCase()));
  function close() { setOpen(false); trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    setQuery("");
    search.current?.focus();
  }, [open]);
  return <div className="theme-switcher" ref={root} onKeyDown={event => {
    if (!open) return;
    if (event.target === search.current && !["ArrowDown", "ArrowUp"].includes(event.key)) return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(root.current!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : index < 0 ? (event.key === "ArrowUp" ? items.length - 1 : 0) : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
    items[next]?.scrollIntoView({ block: "nearest" });
  }}>
    <button ref={trigger} type="button" className="icon-button" aria-label="Choose color theme" title="Choose color theme" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} onKeyDown={event => {
      if (!open && event.key === "ArrowDown") { event.preventDefault(); setOpen(true); }
    }}><Palette size={19} /></button>
    {open && <div className="theme-switcher-menu theme-switcher-picker" role="dialog" aria-label="Choose color theme">
      <div className="theme-picker-header">
        <span className="theme-switcher-heading">Appearance <small>{themeOptions.length} themes</small><button type="button" className="theme-picker-close" onClick={close} aria-label="Close theme picker" title="Close theme picker"><X size={17} /></button></span>
        <label className="theme-picker-search"><Search size={16} aria-hidden="true" /><input ref={search} value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a theme…" aria-label="Search themes" /></label>
      </div>
      <div className="theme-picker-results" role="menu" aria-label="Color themes">
        {options.map(({ value, label, Icon }) => <button key={value} type="button" role="menuitemradio" aria-checked={selected === value} onClick={() => setTheme(value)}>
          <Icon size={18} aria-hidden="true" /><span>{label}</span>{selected === value ? <Check size={16} aria-hidden="true" /> : null}
        </button>)}
      </div>
      {!options.length && <p className="theme-picker-empty" role="status">No matching themes. Try another name.</p>}
    </div>}
  </div>;
}
