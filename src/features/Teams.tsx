import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, LockKeyhole, MessageSquare, MonitorUp, Paperclip, Phone, Search, Send, Smile, Users, Video, X } from "lucide-react";
import { useAuth } from "../app/providers";
import { directoryPeople } from "../lib/profiles";
import { previewEmployees } from "../lib/preview";
import { initials } from "../lib/domain";
import { EmptyState, ErrorState, Loading } from "../components/ui";
import type { Employee } from "../lib/types";
import MeetingStudio from "./MeetingStudio";

function PersonAvatar({ person, large = false }: { person: Employee; large?: boolean }) {
  const color = [...person.full_name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;
  return <span className={`teams-avatar teams-avatar--${color}${large ? " teams-avatar--large" : ""}`} aria-hidden="true">{initials(person.full_name)}</span>;
}

export default function Teams({ workflowDraft }: { workflowDraft?: { name: string; email: string; message: string } } = {}) {
  const { preview, profile } = useAuth();
  const [view, setView] = useState<"chat" | "studio">("chat");
  const [search, setSearch] = useState("");
  const [localDraft, setLocalDraft] = useState("");
  const [department, setDepartment] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["teams-directory", preview],
    queryFn: () => preview ? Promise.resolve(previewEmployees) : directoryPeople(),
  });
  const people = query.data ?? [];
  const departments = useMemo(() => [...new Set(people.map(person => person.departments?.name).filter(Boolean))].sort() as string[], [people]);
  const filtered = useMemo(() => people.filter(person => {
    const text = `${person.full_name} ${person.email} ${person.title} ${person.departments?.name ?? ""}`.toLowerCase();
    return text.includes(search.trim().toLowerCase()) && (!department || person.departments?.name === department);
  }), [people, search, department]);
  useEffect(() => {
    if (!workflowDraft) return;
    let index = 0;
    const timer = setInterval(() => {
      index += 3; setSearch(workflowDraft.name.slice(0, index));
      setLocalDraft(workflowDraft.message.slice(0, Math.max(0,index-workflowDraft.name.length)));
      if (index > workflowDraft.name.length + workflowDraft.message.length) clearInterval(timer);
    }, 20);
    return () => clearInterval(timer);
  }, [workflowDraft]);
  useEffect(() => {
    if (!workflowDraft) return;
    const person = people.find(p => p.email.toLowerCase() === workflowDraft.email.toLowerCase());
    if (person) setSelectedId(person.id);
  }, [people, workflowDraft]);
  const selected = workflowDraft ? people.find(person => person.email.toLowerCase() === workflowDraft.email.toLowerCase()) : people.find(person => person.id === selectedId) ?? people[0];

  return <section className="teams-page" aria-labelledby="teams-page-title">
    <header className="teams-page-heading">
      <div><span className="teams-eyebrow">WORKSPACE / CONVERSATIONS</span><h1 id="teams-page-title">A little closer, together<span>.</span></h1><p>Your people. One place to connect.</p></div>
      <span className="teams-approval-badge"><LockKeyhole size={14} /> Awaiting approval</span>
    </header>
    <div className="teams-view-tabs" role="tablist" aria-label="Teams views" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "chat" : event.key === "End" ? "studio" : view === "chat" ? "studio" : "chat";
      setView(next);
      event.currentTarget.querySelector<HTMLButtonElement>(`#teams-tab-${next}`)?.focus();
    }}>
      <button id="teams-tab-chat" type="button" role="tab" aria-controls="teams-view-chat" aria-selected={view === "chat"} tabIndex={view === "chat" ? 0 : -1} onClick={() => setView("chat")}><MessageSquare size={16} />Colleagues</button>
      <button id="teams-tab-studio" type="button" role="tab" aria-controls="teams-view-studio" aria-selected={view === "studio"} tabIndex={view === "studio" ? 0 : -1} onClick={() => setView("studio")}><MonitorUp size={16} />Screen studio</button>
    </div>
    <div id="teams-view-studio" className="teams-studio-panel" role="tabpanel" aria-labelledby="teams-tab-studio" hidden={view !== "studio"} tabIndex={0}><MeetingStudio active={view === "studio"} /></div>
    <div id="teams-view-chat" role="tabpanel" aria-labelledby="teams-tab-chat" hidden={view !== "chat"} className={`teams-workspace${selectedId ? " teams-workspace--selected" : ""}`}>
      <aside className="teams-directory" aria-label="Employee chat directory">
        <header className="teams-directory-heading"><div><span className="teams-app-mark"><MessageSquare size={18} /></span><h2>Teams</h2></div><span className="teams-count">{people.length} people</span></header>
        <div className="teams-directory-tools">
          <div className="teams-search"><Search size={16} /><input aria-label="Search colleagues" placeholder="Find a colleague…" value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" aria-label="Clear colleague search" onClick={() => setSearch("")}><X size={14} /></button>}</div>
          <select aria-label="Filter colleagues by department" value={department} onChange={event => setDepartment(event.target.value)}><option value="">All departments</option>{departments.map(name => <option key={name} value={name}>{name}</option>)}</select>
        </div>
        <div className="teams-list-heading"><span>YOUR COLLEAGUES</span><span>{filtered.length}</span></div>
        <div className="teams-person-list" aria-label="Colleagues">
          {query.isPending ? <Loading /> : query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : !people.length ? <EmptyState title="Your directory is empty" description="Employees will appear here once they are added to the workspace." /> : !filtered.length ? <EmptyState title="No colleagues found" description="Try another name or department." /> : filtered.map(person => <button type="button" key={person.id} className={`teams-person${selected?.id === person.id ? " teams-person--active" : ""}`} onClick={() => setSelectedId(person.id)} aria-pressed={selected?.id === person.id}>
            <PersonAvatar person={person} /><span className="teams-person-copy"><strong>{person.full_name}{person.id === profile?.id && <small> You</small>}</strong><span>{person.title || person.departments?.name || "Team member"}</span></span><span className="teams-person-arrow"><ArrowUpRight size={14} /></span>
          </button>)}
        </div>
        <footer className="teams-directory-footer"><Users size={14} /><span>From your employee directory</span></footer>
      </aside>
      <section className="teams-conversation" aria-label={selected ? `Conversation with ${selected.full_name}` : "Conversation preview"}>
        <header className="teams-conversation-heading">
          <button type="button" className="teams-mobile-back icon-button" aria-label="Back to colleagues" onClick={() => setSelectedId(null)}><ArrowLeft size={19} /></button>
          {selected ? <><PersonAvatar person={selected} /><div className="teams-contact-heading"><h2>{selected.full_name}</h2><p>{[selected.title, selected.departments?.name].filter(Boolean).join(" · ") || selected.email}</p></div></> : <div className="teams-contact-heading"><h2>{workflowDraft ? `Draft for ${workflowDraft.name}` : "Your conversations"}</h2><p>{workflowDraft ? `${workflowDraft.email} — local preview only` : "Select a colleague to get started."}</p></div>}
          <div className="teams-call-actions"><button type="button" disabled aria-label="Video calls unavailable pending Microsoft approval" title="Video calls require Microsoft approval"><Video size={19} /></button><button type="button" disabled aria-label="Voice calls unavailable pending Microsoft approval" title="Voice calls require Microsoft approval"><Phone size={18} /></button></div>
        </header>
        <div className="teams-conversation-body">
          <div className="teams-conversation-intro">
            <div className="teams-chat-art" aria-hidden="true"><span className="teams-art-circle" /><span className="teams-art-bubble teams-art-bubble--back"><i /><i /></span><span className="teams-art-bubble teams-art-bubble--front"><i /><i /><i /></span><span className="teams-art-lock"><LockKeyhole size={18} /></span></div>
            <span className="teams-eyebrow">GOOD CONVERSATIONS START HERE</span>
            <h3>{selected ? `Connect with ${selected.full_name.split(" ")[0]}` : "Make room for connection"}</h3>
            <p>A quick question. A shared idea. A moment to catch up.<br />Your Teams conversations will feel right at home.</p>
            {selected && <div className="teams-contact-card"><PersonAvatar person={selected} large /><strong>{selected.full_name}</strong><span>{selected.title || "Team member"}</span><span>{selected.email}</span>{selected.location && <small>{selected.location}</small>}</div>}
          </div>
        </div>
        <div className="teams-composer-area">
          <div className="teams-permission-note"><span><LockKeyhole size={16} /></span><div><strong>Messaging is waiting for Microsoft approval</strong><p>You can browse colleagues now. Chats will be available once access is approved.</p></div></div>
          <div className="teams-composer" aria-describedby="teams-composer-status"><textarea disabled={!workflowDraft} value={workflowDraft ? localDraft : ""} onChange={e => setLocalDraft(e.target.value)} aria-label={workflowDraft ? "Local draft only — not sent" : "Message composer unavailable pending Microsoft approval"} placeholder={selected ? `Message ${selected.full_name.split(" ")[0]}…` : "Write a message…"} rows={2} /><div className="teams-composer-toolbar"><div><button disabled type="button" aria-label="Attachments unavailable"><Paperclip size={18} /></button><button disabled type="button" aria-label="Emoji unavailable"><Smile size={18} /></button><span id="teams-composer-status">{workflowDraft ? "Local draft — not sent" : "Messaging unavailable"}</span></div><button disabled type="button" className="teams-send" aria-label="Sending messages unavailable"><Send size={16} /><span>Send</span></button></div></div>
        </div>
      </section>
    </div>
  </section>;
}
