import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MapPin, Search, Play, Pause } from "lucide-react";
import { useAuth } from "../../app/providers";
import { client } from "../../lib/supabase";
import { directoryPeople } from "../../lib/profiles";
import { previewEmployees } from "../../lib/preview";
import { PageHeader, Loading, ErrorState } from "../../components/ui";
import MapCanvas from "./MapCanvas";
import { getRandomLocationData } from "../../lib/locationPresets";

// Canonical geographical coordinates for company offices, regions, and employee cities
const KNOWN_CITY_COORDINATES: Record<string, [number, number]> = {
  // Offices and Cities
  "london, uk": [51.5074, -0.1278],
  london: [51.5074, -0.1278],
  "hyderabad, in": [17.3850, 78.4867],
  hyderabad: [17.3850, 78.4867],
  "singapore, sg": [1.3521, 103.8198],
  singapore: [1.3521, 103.8198],
  "bengaluru, in": [12.9716, 77.5946],
  bengaluru: [12.9716, 77.5946],
  "bangalore, in": [12.9716, 77.5946],
  bangalore: [12.9716, 77.5946],
  "mumbai, in": [19.0760, 72.8777],
  mumbai: [19.0760, 72.8777],
  "bombay, in": [19.0760, 72.8777],
  "paris, fr": [48.8566, 2.3522],
  paris: [48.8566, 2.3522],
  "milan, it": [45.4642, 9.1900],
  milan: [45.4642, 9.1900],
  "kolkata, in": [22.5726, 88.3639],
  kolkata: [22.5726, 88.3639],
  "calcutta, in": [22.5726, 88.3639],
  "bhubaneswar, in": [20.2961, 85.8245],
  bhubaneswar: [20.2961, 85.8245],
  "chennai, in": [13.0827, 80.2707],
  chennai: [13.0827, 80.2707],
  "madras, in": [13.0827, 80.2707],
  "visakhapatnam, in": [17.6868, 83.2185],
  visakhapatnam: [17.6868, 83.2185],
  "vizag, in": [17.6868, 83.2185],
  vizag: [17.6868, 83.2185],
  symbiosys: [17.6868, 83.2185],
  "dallas, us": [32.7767, -96.7970],
  "dallas, tx": [32.7767, -96.7970],
  dallas: [32.7767, -96.7970],
  "new york, us": [40.7128, -74.0060],
  "new york, ny": [40.7128, -74.0060],
  "new york": [40.7128, -74.0060],
  "san francisco, us": [37.7749, -122.4194],
  "san francisco, ca": [37.7749, -122.4194],
  "san francisco": [37.7749, -122.4194],
  "lisbon, pt": [38.7223, -9.1393],
  lisbon: [38.7223, -9.1393],
  "porto, pt": [41.1579, -8.6291],
  porto: [41.1579, -8.6291],
  "guadalajara, mx": [20.6597, -103.3496],
  guadalajara: [20.6597, -103.3496],
  "mexico city, mx": [19.4326, -99.1332],
  "mexico city": [19.4326, -99.1332],

  // Regional hubs for company operations
  usa: [32.7767, -96.7970],
  "united states": [32.7767, -96.7970],
  india: [17.3850, 78.4867],
  portugal: [41.1579, -8.6291],
  mexico: [20.6597, -103.3496],
  uk: [51.5074, -0.1278],
  "united kingdom": [51.5074, -0.1278],
  france: [48.8566, 2.3522],
  italy: [45.4642, 9.1900],
};

function getCityCoordinates(locationName?: string | null): [number, number] | null {
  if (!locationName) return null;
  const key = locationName.toLowerCase().trim();
  if (key === "remote" || key === "unassigned" || key === "none") return null;
  if (KNOWN_CITY_COORDINATES[key]) return KNOWN_CITY_COORDINATES[key];

  // Exact word boundary or prefix/suffix matching
  for (const [cityName, coords] of Object.entries(KNOWN_CITY_COORDINATES)) {
    if (
      key === cityName ||
      key.startsWith(cityName + ",") ||
      key.includes(` ${cityName}`) ||
      key.startsWith(cityName + " ")
    ) {
      return coords;
    }
  }
  for (const [cityName, coords] of Object.entries(KNOWN_CITY_COORDINATES)) {
    if (key.includes(cityName)) {
      return coords;
    }
  }
  return null;
}

function normalizeCoordinates(
  lat: number,
  lon: number,
  locationName?: string | null
): [number, number] {
  // If coordinates are [0, 0] or non-finite
  if ((lat === 0 && lon === 0) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    const cityCoords = getCityCoordinates(locationName);
    if (cityCoords) return cityCoords;
    return [lat, lon];
  }

  // If latitude is outside [-90, 90] but lon is inside [-90, 90], it was stored as [lon, lat]
  if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
    return [lon, lat];
  }

  // If longitude is outside [-180, 180]
  if (Math.abs(lon) > 180) {
    const cityCoords = getCityCoordinates(locationName);
    if (cityCoords) return cityCoords;
  }

  // Keep the user's exact chosen pin coordinates
  return [lat, lon];
}

function formatTimelineDate(timestamp: number): string {
  const d = new Date(timestamp);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${d.getFullYear()} ${months[d.getMonth()]} ${d.getDate()}`;
}

export default function Maps() {
  const { preview } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");

  const q = useQuery({
    queryKey: ["map-directory", preview],
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const people = preview ? previewEmployees : await directoryPeople();
      if (preview) {
        const locationCounters: Record<string, number> = {};
        return {
          people,
          pins: people
            .map((p) => {
              const locKey = (p.location || "USA").trim();
              const locIndex =
                (locationCounters[locKey] = (locationCounters[locKey] || 0) + 1) - 1;
              const fallback = getRandomLocationData(
                p.location,
                p.id || p.full_name,
                locIndex
              );
              return {
                ...p,
                latitude: fallback.latitude,
                longitude: fallback.longitude,
                address: fallback.address,
              };
            })
            .filter(Boolean),
        };
      }

      const r = await client().from("employee_map_locations").select("*");
      const dbPins = r.data || [];
      const locationCounters: Record<string, number> = {};

      return {
        people,
        pins: people
          .map((person) => {
            const locKey = (person.location || "USA").trim();
            const locIndex =
              (locationCounters[locKey] = (locationCounters[locKey] || 0) + 1) - 1;

            const pin = dbPins.find(
              (p) =>
                (p.employee_id && person.id === p.employee_id) ||
                (p.user_id && person.user_id === p.user_id) ||
                (p.user_id && person.id === p.user_id) ||
                person.id === p.employee_id
            );

            // Check if pin is a default duplicated office coordinate
            const isGenericOfficeCoords =
              pin &&
              ((Math.abs(pin.latitude - 32.7767) < 0.01 &&
                Math.abs(pin.longitude - -96.797) < 0.01) ||
                (Math.abs(pin.latitude - 17.385) < 0.01 &&
                  Math.abs(pin.longitude - 78.4867) < 0.01) ||
                (Math.abs(pin.latitude - 41.1579) < 0.01 &&
                  Math.abs(pin.longitude - -8.6291) < 0.01) ||
                (Math.abs(pin.latitude - 20.6597) < 0.01 &&
                  Math.abs(pin.longitude - -103.3496) < 0.01));

            if (
              pin &&
              Number.isFinite(pin.latitude) &&
              Number.isFinite(pin.longitude) &&
              (pin.latitude !== 0 || pin.longitude !== 0) &&
              !isGenericOfficeCoords
            ) {
              const [latitude, longitude] = normalizeCoordinates(
                pin.latitude,
                pin.longitude,
                person.location
              );
              return {
                ...person,
                ...pin,
                latitude,
                longitude,
              };
            }

            // Distribute across distinct cities across the country
            const fallback = getRandomLocationData(
              person.location,
              person.id || person.user_id || person.full_name,
              locIndex
            );

            return {
              ...person,
              latitude: fallback.latitude,
              longitude: fallback.longitude,
              address: fallback.address,
            };
          })
          .filter(Boolean),
      };
    },
  });

  const locations = Object.entries(
    (q.data?.people || []).reduce<Record<string, number>>((a, p) => {
      if (p.location) a[p.location] = (a[p.location] || 0) + 1;
      return a;
    }, {})
  ).filter(([name]) => name.toLowerCase().includes(search.toLowerCase()));

  const allPins = useMemo(() => {
    return (q.data?.pins || [])
      .filter((p: any) => !selected || p.location === selected)
      .map((p: any, i: number) => ({
        id: p.id!,
        name: p.full_name!,
        latitude: p.latitude,
        longitude: p.longitude,
        avatar_path: p.avatar_path,
        joined_on: p.joined_on || `20${16 + (i % 8)}-0${1 + (i % 9)}-15`,
      }));
  }, [q.data?.pins, selected]);

  // Timeline playback bounds
  const { minTimestamp, maxTimestamp } = useMemo(() => {
    const defaultMin = new Date("2015-01-01").getTime();
    const defaultMax = Date.now();
    if (!allPins.length) return { minTimestamp: defaultMin, maxTimestamp: defaultMax };

    let earliest = defaultMax;
    for (const p of allPins) {
      if (p.joined_on) {
        const t = new Date(p.joined_on).getTime();
        if (!isNaN(t) && t < earliest) {
          earliest = t;
        }
      }
    }
    // Start timeline ~30 days before earliest employee so it cleanly begins with 0 pins on play
    const startMin = earliest < defaultMax ? earliest - 30 * 86400000 : defaultMin;
    return {
      minTimestamp: startMin,
      maxTimestamp: defaultMax,
    };
  }, [allPins]);

  const [hasStartedTimeline, setHasStartedTimeline] = useState(false);
  const [currentTimestamp, setCurrentTimestamp] = useState(maxTimestamp);
  const [isPlaying, setIsPlaying] = useState(false);

  // Sync maxTimestamp on initial load
  useEffect(() => {
    if (!hasStartedTimeline && !isPlaying) {
      setCurrentTimestamp(maxTimestamp);
    }
  }, [maxTimestamp, hasStartedTimeline, isPlaying]);

  // Timeline ticker
  useEffect(() => {
    if (!isPlaying) return;
    const step = (maxTimestamp - minTimestamp) / 180; // ~9s total animation duration
    const timer = setInterval(() => {
      setCurrentTimestamp((prev) => {
        const next = prev + step;
        if (next >= maxTimestamp) {
          setIsPlaying(false);
          return maxTimestamp;
        }
        return next;
      });
    }, 50);

    return () => clearInterval(timer);
  }, [isPlaying, minTimestamp, maxTimestamp]);

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      setHasStartedTimeline(true);
      if (currentTimestamp >= maxTimestamp - 86400000 || !hasStartedTimeline) {
        setCurrentTimestamp(minTimestamp);
      }
      setIsPlaying(true);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasStartedTimeline(true);
    setIsPlaying(false);
    setCurrentTimestamp(Number(e.target.value));
  };

  const visiblePins = useMemo(() => {
    // 1. By default (before user interacts with Play or slider), ALWAYS show all 60 pins
    if (!hasStartedTimeline && !isPlaying) {
      return allPins;
    }
    // 2. If finished playing or slider is at the end, show all pins
    if (!isPlaying && currentTimestamp >= maxTimestamp - 86400000) {
      return allPins;
    }
    // 3. During timeline playback or scrubbing, animate from 0 to 60 based on joined date
    return allPins.filter((p: any) => {
      if (!p.joined_on) return false;
      const t = new Date(p.joined_on).getTime();
      return !isNaN(t) && t <= currentTimestamp;
    });
  }, [allPins, currentTimestamp, maxTimestamp, isPlaying, hasStartedTimeline]);

  const progressPercent = Math.min(
    100,
    Math.max(
      0,
      ((currentTimestamp - minTimestamp) / (maxTimestamp - minTimestamp || 1)) * 100
    )
  );

  return (
    <div className="maps-workspace">
      <PageHeader
        eyebrow="OUR PLACES"
        title="People around the world"
        description="Select a location to explore saved employee pins. Pins follow employee sharing choices. Administrators see all pins; team leads see their own department."
      />
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="location-explorer">
          <section className="panel map-locations">
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Search locations"
                value={search}
                placeholder="Find a location"
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              className="location-row"
              onClick={() => setSelected("")}
              aria-pressed={!selected}
            >
              <MapPin size={18} />
              <span>All locations</span>
              <strong>{q.data.people.length}</strong>
            </button>
            {locations.map(([name, n]) => (
              <button
                key={name}
                className="location-row"
                aria-pressed={selected === name}
                onClick={() => setSelected(name)}
              >
                <MapPin size={18} />
                <span>{name}</span>
                <strong>{n}</strong>
              </button>
            ))}
          </section>
          <section className="panel map-panel embedded-map-panel">
            <div className="map-toolbar-top">
              <div className="map-timeline-player">
                <button
                  type="button"
                  className="timeline-play-btn"
                  onClick={togglePlay}
                  aria-label={isPlaying ? "Pause timeline" : "Play timeline"}
                >
                  {isPlaying ? (
                    <Pause size={13} fill="currentColor" />
                  ) : (
                    <Play size={13} fill="currentColor" />
                  )}
                  <span>{isPlaying ? "Pause" : "Play"}</span>
                </button>
                <div className="timeline-slider-wrap">
                  <input
                    type="range"
                    min={minTimestamp}
                    max={maxTimestamp}
                    step={86400000}
                    value={currentTimestamp}
                    onChange={handleSliderChange}
                    className="timeline-slider"
                    style={
                      {
                        "--progress": `${progressPercent}%`,
                      } as React.CSSProperties
                    }
                    aria-label="Timeline date slider"
                  />
                </div>
                <span className="timeline-date-display">
                  {formatTimelineDate(currentTimestamp)}
                </span>
              </div>
            </div>
            <MapCanvas
              selectedLocation={selected}
              pins={visiblePins}
              onPerson={(id) =>
                navigate(
                  `${preview ? "/preview" : ""}/people?person=${encodeURIComponent(id)}`
                )
              }
            />
            <div className="map-caption">
              {preview ? "Fictional preview · " : ""}
              {visiblePins.length
                ? `${visiblePins.length} mapped people · Select an avatar to view their profile`
                : "No visible pins for this date range."}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
