import { createClient } from "npm:@supabase/supabase-js@2";
import {
  GitHub,
  Fault,
  repositoryName,
  branchName,
  snapshot,
  publish,
} from "./github.ts";

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const origins = new Set(
    (Deno.env.get("APP_ORIGIN") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  for (const item of [...origins]) {
    try {
      const url = new URL(item);
      if (["localhost", "127.0.0.1"].includes(url.hostname)) {
        url.hostname = url.hostname === "localhost" ? "127.0.0.1" : "localhost";
        origins.add(url.origin);
      }
    } catch {
      /* Invalid configured origins cannot authorize requests. */
    }
  }
  const headers = {
    "Access-Control-Allow-Origin": origins.has(origin) ? origin : "",
    "Access-Control-Allow-Headers":
      "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });
  if (!origin || !origins.has(origin))
    return reply(403, { error: "Origin not permitted." });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "POST required." });
  const auth = req.headers.get("authorization");
  if (!auth) return reply(401, { error: "Sign into the portal first." });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: auth } },
      },
    );
    const {
      data: { user },
      error,
    } = await sb.auth.getUser();
    if (error || !user)
      return reply(401, {
        error: "Your portal session expired. Sign in again.",
      });
    const owner = Deno.env.get("GITHUB_EDITOR_OWNER_USER_ID")?.trim();
    if (owner && owner !== user.id)
      return reply(403, {
        error: "This GitHub connection belongs to another portal account.",
      });
    const reader = req.body?.getReader();
    if (!reader) throw new Fault(400, "Request body required.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 6 * 1024 * 1024) {
        await reader.cancel();
        throw new Fault(413, "Request exceeds the 6 MB limit.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let body;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Fault(400, "Invalid request.");
    }
    if (
      !body ||
      !["status", "repository", "import", "push"].includes(body.action)
    )
      throw new Fault(400, "Unsupported GitHub operation.");
    const token = Deno.env.get("GITHUB_EDITOR_TOKEN")?.trim();
    const repo = Deno.env.get("GITHUB_EDITOR_REPOSITORY")?.trim();
    if (!owner || !token || !repo) {
      const message =
        "Finish the one-time GitHub setup in Supabase Edge Function secrets, then check the connection again.";
      return reply(body.action === "status" ? 200 : 503, {
        ready: false,
        repository: repo ?? "",
        message,
        missing: [
          !owner && "GITHUB_EDITOR_OWNER_USER_ID",
          !token && "GITHUB_EDITOR_TOKEN",
          !repo && "GITHUB_EDITOR_REPOSITORY",
        ].filter(Boolean),
      });
    }
    if (!/^[a-f0-9-]{36}$/i.test(owner))
      throw new Fault(
        503,
        "Configure a valid portal user ID for the GitHub connection.",
      );
    const configuredRepo = repositoryName(repo);
    let github = new GitHub(token, configuredRepo);
    if (body.action === "status") {
      const info = await github.info();
      return reply(200, {
        ready: true,
        repository: info.full_name,
        defaultBranch: info.default_branch,
        message:
          "GitHub connected. Import a branch, edit, then push your reviewed changes.",
      });
    }
    const requestedRepo = repositoryName(body.repository);
    if (requestedRepo.toLowerCase() !== configuredRepo.toLowerCase()) {
      if (requestedRepo.split("/")[0].toLowerCase() !== configuredRepo.split("/")[0].toLowerCase())
        throw new Fault(403, "Choose a repository owned by the configured GitHub account.");
      github = new GitHub(token, requestedRepo);
      const target = await github.info();
      if (target.private !== false) throw new Fault(403, "Additional repositories must be public and accessible to the configured token.");
    }
    if (body.action === "repository") {
      const info = await github.info();
      const branches = await github.request<{ name: string }[]>(
        "/branches?per_page=100",
      );
      return reply(200, {
        repository: {
          full_name: info.full_name,
          default_branch: info.default_branch,
        },
        branches,
      });
    }
    const branch = branchName(body.branch);
    if (body.action === "import")
      return reply(200, await snapshot(github, branch));
    if (body.confirmed !== true)
      throw new Fault(
        400,
        "Review the changed files and confirm the destination before pushing.",
      );
    return reply(
      200,
      await publish(
        github,
        branch,
        body.baseCommit,
        body.message,
        body.changes,
      ),
    );
  } catch (error) {
    if (error instanceof Fault)
      return reply(error.status, { error: error.message });
    // Do not echo upstream bodies, headers, tokens or arbitrary exception text.
    return reply(502, {
      error:
        "Could not complete the GitHub request. Your editor files are preserved. Check the branch on GitHub before retrying a push.",
    });
  }
});
