import { createClient } from "npm:@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
Deno.serve(async (req: Request) => {
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return respond({ error: "POST required" }, 405);
  try {
    const authorization = req.headers.get("Authorization") || "";
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user) return respond({ error: "Sign in required" }, 401);
    const endpoint = Deno.env.get("GEOCODER_URL");
    if (!endpoint)
      return respond(
        {
          error:
            "Automatic address lookup is not configured. Place your pin on the map instead.",
        },
        503,
      );
    const parsed = new URL(endpoint);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname === "nominatim.openstreetmap.org"
    )
      return respond(
        { error: "Configure an approved private-address geocoding provider." },
        503,
      );
    const record = await client
      .from("employee_private_details")
      .select("address")
      .eq("user_id", user.id)
      .single();
    if (record.error || !record.data?.address)
      return respond({ error: "Save an address first." }, 400);
    const existing = await client
      .from("employee_map_locations")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return respond({ status: "already_mapped" });
    const permit = await client.rpc("reserve_profile_geocoding");
    if (permit.error) throw permit.error;
    if (!permit.data)
      return respond(
        { error: "Address lookup is busy. Try again shortly." },
        429,
      );
    parsed.searchParams.set("q", record.data.address);
    parsed.searchParams.set("format", "json");
    parsed.searchParams.set("limit", "1");
    const headers: Record<string, string> = {
      "User-Agent": "Tekzenit employee portal",
    };
    const token = Deno.env.get("GEOCODER_TOKEN");
    if (token) headers.Authorization = "Bearer " + token;
    const result = await fetch(parsed, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!result.ok)
      return respond(
        { error: "Address lookup failed. Place your pin manually or retry." },
        502,
      );
    const rows = await result.json();
    const lat = Number(rows[0]?.lat),
      lon = Number(rows[0]?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon))
      return respond(
        { error: "Address not found. Place your pin manually." },
        422,
      );
    const saved = await client.rpc("save_my_map_pin", {
      p_lat: lat,
      p_lon: lon,
      p_address: record.data.address,
      p_shared: false,
    });
    if (saved.error)
      return respond(
        { error: "Address changed during lookup. Please retry." },
        409,
      );
    return respond({ status: "updated" });
  } catch {
    return respond({ error: "Map update failed. Please retry." }, 500);
  }
});
