import MapAudience from "./MapAudience";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../app/providers";
import { client } from "../../lib/supabase";
import { rpc } from "../../lib/api";
import { errorMessage } from "../../lib/domain";
import { Modal, useToast } from "../../components/ui";
import MapCanvas from "../maps/MapCanvas";
import type { Employee } from "../../lib/types";
import { getRandomLocationData } from "../../lib/locationPresets";

export default function MapPosition({
  address,
  employee,
}: {
  address: string;
  employee?: Employee;
}) {
  const { profile, preview } = useAuth();
  const [open, setOpen] = useState(false),
    [point, setPoint] = useState<[number, number] | null>(null),
    [shared, setShared] = useState(false),
    [busy, setBusy] = useState(false);
  const [locations, setLocations] = useState<string[]>([]),
    [users, setUsers] = useState<string[]>([]);
  const [coordinates, setCoordinates] = useState<[string, string]>(["", ""]);
  const [addressValue, setAddressValue] = useState(address || "");
  const [validation, setValidation] = useState("");

  useEffect(() => {
    if (address && !addressValue) {
      setAddressValue(address);
    }
  }, [address]);

  function updateCoordinate(index: 0 | 1, value: string) {
    const next: [string, string] = [...coordinates];
    next[index] = value;
    setCoordinates(next);
    setPoint(
      next.every((v) => v.trim() !== "")
        ? [Number(next[0]), Number(next[1])]
        : null,
    );
    setValidation("");
  }

  const toast = useToast(),
    qc = useQueryClient();

  const q = useQuery({
    queryKey: ["my-map-pin", employee?.id || profile?.id],
    queryFn: async () => {
      if (preview) return null;
      const targetEmpId = employee?.id || profile?.id;
      const targetUserId = employee?.user_id || profile?.user_id;
      const r = await client()
        .from("employee_map_locations")
        .select("*");
      if (r.error) throw r.error;
      const pin = (r.data || []).find(
        (p: any) =>
          (targetEmpId && p.employee_id === targetEmpId) ||
          (targetUserId && p.user_id === targetUserId) ||
          (targetEmpId && p.user_id === targetEmpId)
      );
      return pin || null;
    },
  });

  return (
    <section className="panel-form">
      <h3>{employee ? "Employee map position" : "Your map position"}</h3>
      <p className="muted">
        Save the address first, then place its pin. Private pins are visible to
        you, your team lead and administrators.
      </p>
      {q.error && (
        <p role="alert">Map setup needs the latest database update.</p>
      )}
      <div className="row-actions">
        <button
          type="button"
          className="button secondary"
          disabled={q.isPending}
          onClick={() => {
            const fallback = getRandomLocationData(
              employee?.location || profile?.location,
              employee?.id || profile?.id || employee?.full_name || profile?.full_name
            );
            const initialAddress =
              address || addressValue || q.data?.address || fallback.address;
            const initialPoint: [number, number] = q.data
              ? [q.data.latitude, q.data.longitude]
              : [fallback.latitude, fallback.longitude];

            setAddressValue(initialAddress);
            setPoint(initialPoint);
            setCoordinates([String(initialPoint[0]), String(initialPoint[1])]);
            setShared(q.data?.shared || false);
            setLocations(q.data?.shared_locations || []);
            setUsers(q.data?.shared_users || []);
            setValidation("");
            setOpen(true);
          }}
        >
          Set map position
        </button>
        {!employee && (
          <button
            type="button"
            className="button secondary"
            disabled={!!employee || busy || (!address && !preview)}
            onClick={async () => {
              if (preview) {
                toast(
                  "Automatic lookup is available in the connected workspace.",
                );
                return;
              }
              setBusy(true);
              try {
                const r = await client().functions.invoke("geocode-profile");
                if (r.error)
                  throw Error(
                    "Automatic address lookup needs the configured geocoding service. You can set your position manually.",
                  );
                await qc.invalidateQueries({ queryKey: ["my-map-pin"] });
                await qc.invalidateQueries({ queryKey: ["map-directory"] });
                toast("Map position updated.");
              } catch (e) {
                toast(errorMessage(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Find saved address
          </button>
        )}
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          employee
            ? `Set ${employee.full_name}’s map position`
            : "Set your map position"
        }
        description="Zoom and select the point for your saved address. Sharing with coworkers is optional."
        wide
      >
        <div className="map-picker">
          <MapCanvas
            avatarSize="large"
            pins={
              point
                ? [
                    {
                      id: "self",
                      name:
                        employee?.full_name ||
                        profile?.full_name ||
                        "Your position",
                      latitude: point[0],
                      longitude: point[1],
                      avatar_path:
                        employee?.avatar_path || profile?.avatar_path,
                    },
                  ]
                : []
            }
            onPick={(lat, lon) => {
              setPoint([lat, lon]);
              setCoordinates([String(lat), String(lon)]);
              setValidation("");
            }}
          />
        </div>
        <p className="muted">
          {point
            ? `${point[0].toFixed(5)}, ${point[1].toFixed(5)}`
            : "Select a position on the map."}
        </p>
        <div className="map-coordinate-fields form-grid">
          <label>
            Address
            <input
              aria-label="Map address"
              type="text"
              placeholder="Enter street, city or address"
              value={addressValue}
              onChange={(e) => {
                setAddressValue(e.target.value);
                setValidation("");
              }}
            />
          </label>
          <label>
            Latitude
            <input
              aria-label="Map latitude"
              type="number"
              min="-90"
              max="90"
              step="any"
              placeholder="Click the map or enter latitude"
              value={coordinates[0]}
              onChange={(e) => updateCoordinate(0, e.target.value)}
            />
          </label>
          <label>
            Longitude
            <input
              aria-label="Map longitude"
              type="number"
              min="-180"
              max="180"
              step="any"
              placeholder="Enter longitude"
              value={coordinates[1]}
              onChange={(e) => updateCoordinate(1, e.target.value)}
            />
          </label>
        </div>
        {!point && (
          <p className="map-pin-hint">
            First click your position on the map, or enter its coordinates
            above. Sharing locations choose who can see your pin; they do not
            place it.
          </p>
        )}
        <div className="map-sharing-row">
          <label className="inline-check">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
            />
            Share this pin with coworkers
          </label>
          <MapAudience
            preview={preview}
            disabled={!shared}
            locations={locations}
            users={users}
            onLocations={setLocations}
            onUsers={setUsers}
          />
        </div>
        <p className="muted">
          Administrators can see all pins. Team leads can see their own
          department only, regardless of sharing selections.
        </p>
        {validation && (
          <p className="map-validation" role="alert">
            {validation}
          </p>
        )}
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={async () => {
            const effectiveAddress = addressValue.trim() || address.trim();
            if (effectiveAddress.length < 3) {
              setValidation(
                "Enter a valid address (at least 3 characters) before saving map position."
              );
              return;
            }
            if (
              !point ||
              !point.every(Number.isFinite) ||
              Math.abs(point[0]) > 90 ||
              Math.abs(point[1]) > 180
            ) {
              setValidation(
                "Choose your position on the map or enter valid latitude and longitude before saving.",
              );
              return;
            }
            if (shared && !locations.length && !users.length) {
              setValidation(
                "Choose at least one location or coworker to share with, or turn sharing off.",
              );
              return;
            }
            setBusy(true);
            try {
              if (!preview) {
                if (employee) {
                  // Ensure address is persisted in private details first
                  await rpc("admin_update_employee", {
                    p_employee: employee.id,
                    p_name: employee.full_name,
                    p_code: employee.employee_code || null,
                    p_title: employee.title || "",
                    p_department: employee.department_id || null,
                    p_location: employee.location || "",
                    p_bio: employee.bio || "",
                    p_phone: (employee as any).phone || "",
                    p_address: effectiveAddress,
                  });
                  await rpc("save_employee_map", {
                    p_employee: employee.id,
                    p_lat: point[0],
                    p_lon: point[1],
                    p_address: effectiveAddress,
                    p_shared: shared,
                    p_locations: locations,
                    p_users: users,
                  });
                } else {
                  await rpc("update_my_profile", {
                    p_name: profile!.full_name,
                    p_code: profile!.employee_code || null,
                    p_location: profile!.location || "",
                    p_bio: profile!.bio || "",
                    p_phone: (profile as any).phone || "",
                    p_address: effectiveAddress,
                  });
                  await rpc("save_my_map_sharing", {
                    p_lat: point[0],
                    p_lon: point[1],
                    p_address: effectiveAddress,
                    p_shared: shared,
                    p_locations: locations,
                    p_users: users,
                  });
                }
              }
              await qc.invalidateQueries({ queryKey: ["my-map-pin"] });
              await qc.invalidateQueries({ queryKey: ["map-directory"] });
              await qc.invalidateQueries({ queryKey: ["admin-profile"] });
              await qc.invalidateQueries({ queryKey: ["private-profile"] });
              setOpen(false);
              toast(
                preview ? "Preview: no location saved." : "Map position saved.",
              );
            } catch (e) {
              toast(errorMessage(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          Save map position
        </button>
      </Modal>
    </section>
  );
}
