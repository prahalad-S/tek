import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { signedUrl } from "../../lib/api";

export type MapPerson = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  avatar_path?: string | null;
  joined_on?: string | null;
};

type CountryView =
  | { type: "bounds"; bounds: [[number, number], [number, number]] }
  | { type: "center"; center: [number, number]; zoom: number };

// Geographical views for countries/regions to zoom into cleanly
const COUNTRY_VIEWS: Record<string, CountryView> = {
  usa: {
    type: "bounds",
    bounds: [
      [24.5, -125.0],
      [49.5, -66.9],
    ],
  },
  "united states": {
    type: "bounds",
    bounds: [
      [24.5, -125.0],
      [49.5, -66.9],
    ],
  },
  us: {
    type: "bounds",
    bounds: [
      [24.5, -125.0],
      [49.5, -66.9],
    ],
  },
  portugal: {
    type: "center",
    center: [39.5, -8.0],
    zoom: 7,
  },
  mexico: {
    type: "center",
    center: [20.6597, -103.3496],
    zoom: 6,
  },
  india: {
    type: "center",
    center: [17.435, 78.41],
    zoom: 12, // Focuses cleanly on all Hyderabad area hubs
  },
  symbiosys: {
    type: "center",
    center: [17.75, 83.31],
    zoom: 11.5, // Encompasses all 7 Visakhapatnam areas
  },
  uk: {
    type: "bounds",
    bounds: [
      [49.8, -8.8],
      [59.0, 2.0],
    ],
  },
  "united kingdom": {
    type: "bounds",
    bounds: [
      [49.8, -8.8],
      [59.0, 2.0],
    ],
  },
  france: {
    type: "bounds",
    bounds: [
      [41.3, -5.3],
      [51.2, 9.8],
    ],
  },
  italy: {
    type: "bounds",
    bounds: [
      [36.5, 6.5],
      [47.2, 18.7],
    ],
  },
  singapore: {
    type: "center",
    center: [1.3521, 103.8198],
    zoom: 11,
  },
};

function getCountryView(location?: string | null): CountryView | null {
  if (!location) return null;
  const key = location.toLowerCase().trim();
  if (COUNTRY_VIEWS[key]) return COUNTRY_VIEWS[key];
  for (const [name, view] of Object.entries(COUNTRY_VIEWS)) {
    if (key === name || key.includes(name)) {
      return view;
    }
  }
  return null;
}

export default function MapCanvas({
  pins,
  selectedLocation,
  avatarSize = "auto",
  onPerson,
  onPick,
}: {
  pins: MapPerson[];
  selectedLocation?: string;
  avatarSize?: "small" | "large" | "auto";
  onPerson?: (id: string) => void;
  onPick?: (lat: number, lon: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layer = useRef<L.LayerGroup | null>(null);
  const person = useRef(onPerson),
    pick = useRef(onPick),
    prevLocation = useRef<string | undefined>(undefined);
  const [tiles, setTiles] = useState("Loading map…");
  person.current = onPerson;
  pick.current = onPick;

  const isSmall =
    avatarSize === "small"
      ? true
      : avatarSize === "large"
        ? false
        : !selectedLocation;

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { scrollWheelZoom: true }).setView([22, -30], 3.25);
    map.current = m;
    m.attributionControl.setPosition("bottomleft");

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    })
      .on("tileerror", () =>
        setTiles(
          "Map imagery is unavailable. Saved employee pins remain accessible."
        )
      )
      .on("tileload", () => setTiles(""))
      .addTo(m);

    layer.current = L.layerGroup().addTo(m);
    m.on("click", (e) => pick.current?.(e.latlng.lat, e.latlng.lng));
    const observer = new ResizeObserver(() => m.invalidateSize());
    observer.observe(el.current);
    return () => {
      observer.disconnect();
      m.remove();
      map.current = null;
      layer.current = null;
      renderedMarkers.current.clear();
      prevLocation.current = undefined;
    };
  }, []);

  const renderedMarkers = useRef<
    Map<
      string,
      {
        marker: L.Marker;
        line?: L.Polyline;
        isSmall: boolean;
        pin: MapPerson;
      }
    >
  >(new Map());
  const signedUrlCache = useRef<Map<string, string>>(new Map());

  // Handle zooming when selectedLocation changes (independent of timeline ticks)
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    if (prevLocation.current === selectedLocation) return;
    prevLocation.current = selectedLocation;

    if (!selectedLocation) {
      // Zoom out to full world map
      m.flyTo([22, -30], 3.25, { duration: 1.1 });
    } else {
      const target = getCountryView(selectedLocation);
      if (target) {
        if (target.type === "center") {
          m.flyTo(target.center, target.zoom, { duration: 1.2 });
        } else {
          m.flyToBounds(target.bounds, {
            padding: [45, 45],
            duration: 1.2,
          });
        }
      } else if (pins.length) {
        m.flyToBounds(
          L.latLngBounds(
            pins.map((p) => [p.latitude, p.longitude] as [number, number])
          ),
          {
            padding: [65, 65],
            maxZoom: pins.length === 1 ? 13 : 9,
            duration: 1.2,
          }
        );
      }
    }
  }, [selectedLocation]);

  // Marker reconciliation (diffing): keeps existing markers stable to eliminate blinking
  useEffect(() => {
    let cancelled = false;
    const group = layer.current,
      m = map.current;
    if (!group || !m) return;

    // Resync markers if layer was recreated or emptied
    if (group.getLayers().length === 0 && renderedMarkers.current.size > 0) {
      renderedMarkers.current.clear();
    }

    const currentPinsMap = new Map(pins.map((p) => [p.id, p]));

    // 1. Remove markers that are no longer visible or whose size mode changed
    for (const [id, entry] of renderedMarkers.current.entries()) {
      if (!currentPinsMap.has(id) || entry.isSmall !== isSmall) {
        group.removeLayer(entry.marker);
        if (entry.line) {
          group.removeLayer(entry.line);
        }
        renderedMarkers.current.delete(id);
      }
    }

    const iconDimension = isSmall ? 16 : 44;
    const iconAnchorCoord = isSmall ? 8 : 22;

    // 2. Add newly visible pins (existing pins remain untouched and don't flicker)
    for (const p of pins) {
      if (renderedMarkers.current.has(p.id)) {
        continue;
      }

      const avatar = document.createElement("span");
      avatar.className = isSmall
        ? "map-avatar map-avatar-sm"
        : "map-avatar";
      avatar.textContent = isSmall
        ? p.name.charAt(0)
        : p.name
            .split(" ")
            .map((w) => w[0])
            .slice(0, 2)
            .join("");

      if (p.avatar_path) {
        const cached = signedUrlCache.current.get(p.avatar_path);
        if (cached) {
          const img = document.createElement("img");
          img.src = cached;
          img.alt = "";
          avatar.replaceChildren(img);
        } else {
          void signedUrl("avatars", p.avatar_path)
            .then((url) => {
              signedUrlCache.current.set(p.avatar_path!, url);
              if (cancelled) return;
              if (renderedMarkers.current.has(p.id)) {
                const img = document.createElement("img");
                img.src = url;
                img.alt = "";
                avatar.replaceChildren(img);
              }
            })
            .catch(() => {});
        }
      }

      const marker = L.marker([p.latitude, p.longitude], {
        icon: L.divIcon({
          className: isSmall
            ? "person-map-marker person-map-marker-sm"
            : "person-map-marker",
          html: avatar,
          iconSize: [iconDimension, iconDimension],
          iconAnchor: [iconAnchorCoord, iconAnchorCoord],
        }),
        title: p.name,
        alt: p.name,
      }).addTo(group);

      marker.on("click", () => person.current?.(p.id));

      renderedMarkers.current.set(p.id, {
        marker,
        isSmall,
        pin: p,
      });
    }

    // 3. Coordinate sharing spokes & spread calculation
    const same = new Map<string, Array<{ id: string; marker: L.Marker; pin: MapPerson; line?: L.Polyline }>>();
    for (const [id, entry] of renderedMarkers.current.entries()) {
      const key = `${entry.pin.latitude}:${entry.pin.longitude}`;
      same.set(key, [...(same.get(key) || []), { id, marker: entry.marker, pin: entry.pin, line: entry.line }]);
    }

    // Update or create connecting spoke lines
    for (const [_, peers] of same.entries()) {
      peers.forEach((peer) => {
        if (peers.length > 1) {
          if (!peer.line) {
            peer.line = L.polyline([], {
              color: "#7861dc",
              weight: isSmall ? 1 : 1.5,
              opacity: 0.5,
              interactive: false,
            }).addTo(group);
            const entry = renderedMarkers.current.get(peer.id);
            if (entry) entry.line = peer.line;
          }
        } else if (peer.line) {
          group.removeLayer(peer.line);
          peer.line = undefined;
          const entry = renderedMarkers.current.get(peer.id);
          if (entry) entry.line = undefined;
        }
      });
    }

    const spread = () => {
      for (const [_, peers] of same.entries()) {
        const total = peers.length;
        peers.forEach((peer, index) => {
          const origin = L.latLng(peer.pin.latitude, peer.pin.longitude);
          if (total === 1) {
            peer.marker.setLatLng(origin);
            return;
          }
          const center = m.latLngToLayerPoint(origin),
            angle = (2 * Math.PI * index) / total - Math.PI / 2;
          const radius = isSmall
            ? Math.max(12, total * 3.5)
            : Math.max(36, total * 9);
          const at = m.layerPointToLatLng(
            L.point(
              center.x + Math.cos(angle) * radius,
              center.y + Math.sin(angle) * radius
            )
          );
          peer.marker.setLatLng(at);
          peer.line?.setLatLngs([origin, at]);
        });
      }
    };

    spread();
    m.on("zoom", spread);
    m.on("zoomend", spread);
    m.on("viewreset", spread);

    return () => {
      cancelled = true;
      m.off("zoom", spread);
      m.off("zoomend", spread);
      m.off("viewreset", spread);
    };
  }, [pins, isSmall]);

  return (
    <div className="map-canvas-wrap">
      <div
        className="employee-map"
        ref={el}
        aria-label={
          onPick ? "Choose your map position" : "Employee locations map"
        }
      />
      {tiles && (
        <div className="map-load-state" role="status">
          {tiles}
        </div>
      )}
    </div>
  );
}
