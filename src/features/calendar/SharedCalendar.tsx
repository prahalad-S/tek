import { MapPin, Heart, CalendarDays, Search } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../app/providers";
import { rpc } from "../../lib/api";
import { errorMessage, dateKey } from "../../lib/domain";
import { Modal, Badge, useToast } from "../../components/ui";
import type { Employee } from "../../lib/types";
export default function SharedCalendar({
  events,
  holidays,
  people,
  onClose,
  onSaved,
}: {
  events: any[];
  holidays: any[];
  people: Employee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { preview, member, profile } = useAuth();
  const toast = useToast();
  const [holidayLocation, setHolidayLocation] = useState("");
  const [filterKind,setFilterKind]=useState("");
  const [category,setCategory]=useState("");
  const [search,setSearch]=useState("");
  const [upcoming,setUpcoming]=useState(false);
  const [favorites,setFavorites]=useState<string[]>([]);
  const allItems=[...events.map(item=>({...item,itemKind:"event",date:dateKey(new Date(item.starts_at))})),...holidays.map(item=>({...item,itemKind:"holiday",date:item.day}))].sort((a,b)=>a.date.localeCompare(b.date));
  const categoryOptions=[...new Set(allItems.map(i=>i.category || (i.itemKind==="holiday"?"Holiday":"Event")))].sort();
  const locations=[...new Set(["USA","INDIA","SYMBIOSYS",...allItems.flatMap(i=>i.locations?.length?i.locations:i.location?[i.location]:[])])].sort();
  const filtered=allItems.filter(item=>(!filterKind || item.itemKind===filterKind)&&(!category || (item.category || (item.itemKind==="holiday"?"Holiday":"Event"))===category)&&(!holidayLocation || (!item.locations?.length&&!item.location) || (item.locations || [item.location]).some((l:string)=>l.toLowerCase()===holidayLocation.toLowerCase()))&&(!upcoming || item.date>=dateKey(new Date()))&&`${item.name} ${item.description||""} ${item.location||""} ${(item.locations||[]).join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  const [editing, setEditing] = useState<any>(null);
  const [kind, setKind] = useState("event");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const manage = member?.role !== "employee";
  const departments = [
    ...new Map(
      people
        .filter((p) => p.department_id)
        .map((p) => [
          p.department_id,
          { id: p.department_id, name: p.departments?.name },
        ]),
    ).values(),
  ];
  const localTime = (iso: string) => {
    const d = new Date(iso);
    return (
      dateKey(d) +
      "T" +
      String(d.getHours()).padStart(2, "0") +
      ":" +
      String(d.getMinutes()).padStart(2, "0")
    );
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Events & holidays"
      description="Shared items for the selected calendar range. Managers publish to their department; administrators can publish company-wide."
      wide
      className="events-holidays-modal"
    >
      {!editing && <div className="events-filter-bar">
        <label>Topics<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">All topics</option>{categoryOptions.map(c=><option key={c}>{c}</option>)}</select></label>
        <label>Type<select value={filterKind} onChange={e=>setFilterKind(e.target.value)}><option value="">Events & holidays</option><option value="event">Events</option><option value="holiday">Holidays</option></select></label>
        <label>Location<select value={holidayLocation} onChange={e=>setHolidayLocation(e.target.value)}><option value="">All locations</option>{locations.map(l=><option key={l}>{l}</option>)}</select></label>
        <label className="events-search"><Search size={16}/><input aria-label="Search events and holidays" placeholder="Search name or location…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <label className="events-upcoming"><input type="checkbox" checked={upcoming} onChange={e=>setUpcoming(e.target.checked)}/>Upcoming only</label>
      </div>}
      {editing ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (preview) {
              toast("Preview only. No calendar changes saved.");
              setEditing(null);
              return;
            }
            const f = new FormData(event.currentTarget);
            const data: any = Object.fromEntries(f);
            if (kind === "event") {
              data.starts_at = new Date(
                String(f.get("starts_at")),
              ).toISOString();
              data.ends_at = new Date(String(f.get("ends_at"))).toISOString();
            }
            setBusy(true);
            try {
              await rpc("save_calendar_item", {
                p_kind: kind,
                p_data: data,
                p_id: editing.id || null,
              });
              onSaved();
              setEditing(null);
              toast("Calendar item saved.");
            } catch (e) {
              toast(errorMessage(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Type
            <select
              value={kind}
              disabled={!!editing.id}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="event">Event</option>
              <option value="holiday">Holiday</option>
            </select>
          </label>
          <label>
            Name
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={editing.name}
            />
          </label>
          {kind === "holiday" ? (
            <label>
              Date
              <input
                name="day"
                type="date"
                required
                defaultValue={editing.day || dateKey(new Date())}
              />
            </label>
          ) : (
            <div className="form-grid">
              <label>
                Starts
                <input
                  name="starts_at"
                  type="datetime-local"
                  required
                  defaultValue={
                    editing.starts_at ? localTime(editing.starts_at) : undefined
                  }
                />
              </label>
              <label>
                Ends
                <input
                  name="ends_at"
                  type="datetime-local"
                  required
                  defaultValue={
                    editing.ends_at ? localTime(editing.ends_at) : undefined
                  }
                />
              </label>
            </div>
          )}
          <label>
            Description
            <textarea
              name="description"
              maxLength={2000}
              defaultValue={editing.description}
            />
          </label>
          <div className="form-grid">
            {kind === "event" &&
              ["location", "organizer", "participants"].map((field) => (
                <label key={field}>
                  {field}
                  <input
                    name={field}
                    maxLength={300}
                    defaultValue={
                      editing[field] ||
                      (field === "organizer" ? profile?.full_name : "")
                    }
                  />
                </label>
              ))}
            <label>
              Category
              <input name="category" defaultValue={editing.category} />
            </label>
            <label>
              Classification
              <input
                name="type"
                defaultValue={editing.event_type || editing.holiday_type}
              />
            </label>
            <label>
              Status
              <select
                name="status"
                defaultValue={
                  editing.status || (kind === "event" ? "Scheduled" : "Active")
                }
              >
                {(kind === "event"
                  ? ["Scheduled", "Completed", "Cancelled"]
                  : ["Active", "Cancelled"]
                ).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            {member?.role === "admin" && (
              <label>
                Audience
                <select
                  name="department_id"
                  defaultValue={editing.department_id || ""}
                >
                  <option value="">Whole company</option>
                  {departments.map((d) => (
                    <option value={d.id!} key={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setEditing(null)}
            >
              Back to list
            </button>
            <button className="button" disabled={busy}>
              Save calendar item
            </button>
          </div>
        </form>
      ) : (
        <>
          {manage && (
            <button
              className="button"
              onClick={() => {
                setKind("event");
                setEditing({});
              }}
            >
              Add event or holiday
            </button>
          )}
          <div className="events-card-grid">
            {filtered.map((item,index)=>{
              const date=new Date(item.date+"T12:00:00"); const id=`${item.itemKind}:${item.id}`;
              return <article className={`event-date-card event-tone-${index%6}`} key={id}>
                <div className="event-date-sheet"><div className="event-date-month">{date.toLocaleDateString(undefined,{month:"short"})}</div><strong>{date.getDate()}</strong><small>{date.toLocaleDateString(undefined,{month:"short",day:"numeric"})}{item.ends_at && dateKey(new Date(item.ends_at))!==item.date?` – ${new Date(item.ends_at).toLocaleDateString(undefined,{month:"short",day:"numeric"})}`:""}</small><small>{date.getFullYear()}</small></div>
                <div className="event-card-content"><button type="button" className="icon-button event-favorite" aria-label={`${favorites.includes(id)?"Unsave":"Save"} ${item.name}`} aria-pressed={favorites.includes(id)} onClick={()=>setFavorites(previous=>previous.includes(id)?previous.filter(v=>v!==id):[...previous,id])}><Heart size={18} fill={favorites.includes(id)?"currentColor":"none"}/></button><h3>{item.name}</h3><span className="event-category">{item.category || (item.itemKind==="holiday"?"Holiday":item.event_type || "Event")}</span>{item.description && <p>{item.description}</p>}<div className="event-card-location"><MapPin size={15}/><span>{item.locations?.join(" / ") || item.location || "Company-wide"}</span></div><div className="event-card-footer"><Badge>{item.status || (item.itemKind==="holiday"?"Active":"Scheduled")}</Badge>{item.organizer && <small>{item.organizer}</small>}</div>
                  {manage && (member?.role==="admin" || item.department_id===member?.department_id) && <div className="row-actions"><button className="text-button" onClick={()=>{setKind(item.itemKind);setEditing(item);}}>Edit</button><button className="text-button" onClick={()=>setDeleting({id:item.id,kind:item.itemKind,name:item.name})}>Delete</button></div>}
                </div>
              </article>;
            })}
          </div>
          {!filtered.length && <div className="events-empty"><CalendarDays size={28}/><h3>No events or holidays match</h3><p>Try another filter or choose a different calendar period.</p></div>}
          <p className="muted">{filtered.length} items in the selected calendar period · Saved hearts stay in this view only.</p>
        </>
      )}
      {deleting && (
        <div role="alert" className="private-profile">
          <p>Delete “{deleting.name}”?</p>
          <button
            className="button secondary"
            onClick={() => setDeleting(null)}
          >
            Keep item
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              if (preview) {
                setDeleting(null);
                return;
              }
              setBusy(true);
              try {
                await rpc("delete_calendar_item", {
                  p_kind: deleting.kind,
                  p_id: deleting.id,
                });
                onSaved();
                setDeleting(null);
                toast("Calendar item deleted.");
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm deletion
          </button>
        </div>
      )}
    </Modal>
  );
}
