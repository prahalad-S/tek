import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { directoryPeople } from "../../lib/profiles";
import { previewEmployees } from "../../lib/preview";
import { Search, ChevronDown } from "lucide-react";
export default function MapAudience({
  preview,
  disabled,
  locations,
  users,
  onLocations,
  onUsers,
}: {
  preview: boolean;
  disabled: boolean;
  locations: string[];
  users: string[];
  onLocations: (v: string[]) => void;
  onUsers: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["directory-all", preview],
    queryFn: () =>
      preview ? Promise.resolve(previewEmployees) : directoryPeople(),
  });
  const people = q.data || [],
    places = [...new Set(people.map((p) => p.location).filter(Boolean))].sort();
  const match = (s: string) => s.toLowerCase().includes(search.toLowerCase());
  return (
    <div className="map-audience">
      <button
        type="button"
        className="button secondary"
        disabled={disabled}
        aria-expanded={open && !disabled}
        onClick={() => setOpen(!open)}
      >
        Only share with · {locations.length + users.length} selected{" "}
        <ChevronDown size={16} />
      </button>
      {open && !disabled && (
        <div className="audience-menu">
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Search sharing locations or names"
              value={search}
              placeholder="Search a location or employee name"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {q.error ? (
            <p role="alert">Sharing recipients could not load.</p>
          ) : q.isPending ? (
            <p>Loading recipients…</p>
          ) : (
            <div className="audience-options">
              <strong>Locations</strong>
              {places.filter(match).map((place) => (
                <label className="inline-check" key={place}>
                  <input
                    type="checkbox"
                    checked={locations.includes(place)}
                    onChange={(e) =>
                      onLocations(
                        e.target.checked
                          ? [...locations, place]
                          : locations.filter((v) => v !== place),
                      )
                    }
                  />
                  {place}
                </label>
              ))}
              <strong>People</strong>
              {people
                .filter((p) => (preview || p.user_id) && match(p.full_name))
                .map((p) => {
                  const id = p.user_id || p.id;
                  return (
                    <label className="inline-check" key={id}>
                      <input
                        type="checkbox"
                        checked={users.includes(id)}
                        onChange={(e) =>
                          onUsers(
                            e.target.checked
                              ? [...users, id]
                              : users.filter((v) => v !== id),
                          )
                        }
                      />
                      {p.full_name}
                      <small>{p.location}</small>
                    </label>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
