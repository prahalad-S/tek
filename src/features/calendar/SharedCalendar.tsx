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
    >
      {!editing && (
        <label>
          Holiday location
          <select
            value={holidayLocation}
            onChange={(e) => setHolidayLocation(e.target.value)}
          >
            <option value="">All locations</option>
            <option>USA</option>
            <option>INDIA</option>
            <option>SYMBIOSYS</option>
          </select>
        </label>
      )}
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
          {[
            { kind: "event", rows: events },
            {
              kind: "holiday",
              rows: holidays.filter(
                (h) =>
                  !holidayLocation ||
                  !h.locations?.length ||
                  h.locations.includes(holidayLocation),
              ),
            },
          ].map((group) => (
            <section className="profile-section" key={group.kind}>
              <h3>{group.kind === "event" ? "Events" : "Holidays"}</h3>
              {group.rows.length ? (
                group.rows.map((item) => (
                  <article className="career-row" key={item.id}>
                    <h4>{item.name}</h4>
                    <p>
                      {item.day || new Date(item.starts_at).toLocaleString()}
                    </p>
                    <p>{item.description}</p>
                    <p>
                      {[
                        item.locations?.join(" / "),
                        item.location,
                        item.organizer,
                        item.participants,
                        item.category,
                        item.event_type || item.holiday_type,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <Badge>
                      {item.department_id ? "Department" : "Company"}
                    </Badge>
                    <Badge>{item.status}</Badge>
                    {manage &&
                      (member?.role === "admin" ||
                        item.department_id === member?.department_id) && (
                        <div className="row-actions">
                          <button
                            className="button secondary small"
                            onClick={() => {
                              setKind(group.kind);
                              setEditing(item);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="button secondary small"
                            onClick={() =>
                              setDeleting({
                                id: item.id,
                                kind: group.kind,
                                name: item.name,
                              })
                            }
                          >
                            Delete
                          </button>
                        </div>
                      )}
                  </article>
                ))
              ) : (
                <p className="muted">None in this period.</p>
              )}
            </section>
          ))}
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
