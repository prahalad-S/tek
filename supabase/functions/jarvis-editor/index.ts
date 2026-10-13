import { createClient } from "npm:@supabase/supabase-js@2";
import { proposeEdits } from "./ai.ts";
const workerActions = new Set([
  "status",
  "files",
  "apply",
  "open",
  "fetch",
  "pull",
  "branch",
  "build",
  "commit",
  "push",
]);
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const origins = (Deno.env.get("APP_ORIGIN") ?? "")
    .split(",")
    .map((value) => value.trim());
  for (const item of [...origins]) {
    try {
      const url = new URL(item);
      if (["localhost", "127.0.0.1"].includes(url.hostname)) {
        url.hostname = url.hostname === "localhost" ? "127.0.0.1" : "localhost";
        origins.push(url.origin);
      }
    } catch {
      /* Invalid configured origins remain blocked. */
    }
  }
  const headers = {
    "Access-Control-Allow-Origin": origins.includes(origin) ? origin : "",
    "Access-Control-Allow-Headers":
      "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });
  if (!origin || !origins.includes(origin))
    return reply(403, { error: "Origin not permitted." });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "POST required." });
  const auth = req.headers.get("authorization");
  if (!auth) return reply(401, { error: "Sign in first." });
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const {
    data: { user },
    error,
  } = await sb.auth.getUser();
  if (error || !user) return reply(401, { error: "Session expired." });
  try {
    const raw = await req.text();
    if (raw.length > 2000000)
      return reply(413, { error: "Request too large." });
    const body = JSON.parse(raw);
    if (body.action === "cloud") {
      const worker = Deno.env.get("JARVIS_WORKER_URL"),
        secret = Deno.env.get("JARVIS_WORKER_SECRET"),
        owner = Deno.env.get("JARVIS_OWNER_USER_ID");
      if (!worker || !secret || !owner)
        return reply(503, {
          error: "Cloud worker URL, secret and owner are not configured yet.",
        });
      if (user.id !== owner)
        return reply(403, {
          error: "This cloud workspace belongs to another portal user.",
        });
      if (!body.request || !workerActions.has(body.request.action))
        return reply(400, { error: "Unsupported worker operation." });
      const url = new URL(worker);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        secret.length < 32
      )
        return reply(503, { error: "Cloud worker configuration is invalid." });
      const result = await fetch(new URL("/api", url), {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(120000),
        headers: {
          Authorization: auth,
          "X-Worker-Secret": secret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body.request),
      });
      return reply(result.status, await result.json());
    }
    if (body.action !== "propose" || body.consent !== true)
      return reply(400, {
        error: "Select files and approve sending them to OpenAI first.",
      });
    if (raw.length > 230000)
      return reply(413, { error: "AI request exceeds the source-file limit." });
    if (!Deno.env.get("OPENAI_API_KEY") || !Deno.env.get("OPENAI_MODEL"))
      return reply(503, {
        error:
          "Configure OPENAI_API_KEY and OPENAI_MODEL in Supabase secrets first.",
      });
    const { error: limit } = await sb.rpc("reserve_agent_request");
    if (limit)
      return reply(429, { error: "Assistant access or daily limit reached." });
    return reply(200, { plan: await proposeEdits(body.message, body.files) });
  } catch (e) {
    return reply(400, {
      error:
        e instanceof Error
          ? e.message
          : "Request failed. Check the operation status before retrying.",
    });
  }
});
