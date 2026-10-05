import { createClient } from "npm:@supabase/supabase-js@2";

const issueFields = ["summary", "status", "issuetype", "priority", "project", "updated"];

Deno.serve(async (req: Request) => {
  const configuredOrigins = (Deno.env.get("APP_ORIGIN") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const requestOrigin = req.headers.get("origin") || "";
  const allowedOrigins = new Set(configuredOrigins);
  for (const configuredOrigin of configuredOrigins) {
    try {
      const configured = new URL(configuredOrigin);
      if (configured.hostname === "localhost" || configured.hostname === "127.0.0.1") {
        const aliasHost = configured.hostname === "localhost" ? "127.0.0.1" : "localhost";
        allowedOrigins.add(`${configured.protocol}//${aliasHost}${configured.port ? `:${configured.port}` : ""}`);
      }
    } catch {
      // Invalid origins remain blocked by the exact-origin check below.
    }
  }
  const origin = allowedOrigins.has(requestOrigin) ? requestOrigin : (configuredOrigins[0] || "");
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });

  if (!origin || req.headers.get("origin") !== origin)
    return reply(403, { error: "Origin not permitted." });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "POST required." });

  const authorization = req.headers.get("authorization");
  if (!authorization) return reply(401, { error: "Sign in first." });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey)
    return reply(503, { error: "Jira connection is not configured." });

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return reply(401, { error: "Session expired." });

  const baseUrl = Deno.env.get("JIRA_BASE_URL");
  const email = Deno.env.get("JIRA_EMAIL");
  const token = Deno.env.get("JIRA_API_TOKEN");
  if (!baseUrl || !email || !token)
    return reply(503, { error: "Jira connection is not configured." });

  try {
    const site = new URL(baseUrl);
    if (
      site.protocol !== "https:" ||
      site.pathname !== "/" ||
      site.search ||
      site.hash
    )
      return reply(503, { error: "Jira connection is not configured." });

    const jiraHeaders = {
      Authorization: `Basic ${btoa(`${email}:${token}`)}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    // Scoped Atlassian API tokens must use api.atlassian.com/ex/jira/{cloudId}.
    // Try that gateway first, then fall back to the site URL for classic tokens.
    let apiBase = site;
    let account: { accountId?: string; displayName?: string } | null = null;
    let gatewayStatus: number | null = null;
    let cloudId = "";
    try {
      const tenantResponse = await fetch(new URL("_edge/tenant_info", site), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (tenantResponse.ok) {
        const tenantInfo = await tenantResponse.json();
        if (typeof tenantInfo.cloudId === "string") cloudId = tenantInfo.cloudId;
      }
    } catch {
      // Classic-token authentication below does not depend on tenant discovery.
    }

    if (cloudId) {
      const gateway = new URL(
        `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/`,
      );
      try {
        const gatewayResponse = await fetch(
          new URL("rest/api/3/myself", gateway),
          {
            headers: jiraHeaders,
            signal: AbortSignal.timeout(10000),
            redirect: "error",
          },
        );
        if (gatewayResponse.ok) {
          apiBase = gateway;
          account = await gatewayResponse.json();
        } else {
          gatewayStatus = gatewayResponse.status;
        }
      } catch {
        // Fall through to the site URL for classic-token authentication.
      }
    }

    if (!account) {
      const accountResponse = await fetch(new URL("rest/api/3/myself", site), {
        headers: jiraHeaders,
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      if (accountResponse.status === 401) {
        const gatewayNote = gatewayStatus
          ? ` The scoped-token gateway also returned HTTP ${gatewayStatus}.`
          : "";
        return reply(502, { error: `Jira returned HTTP 401 while checking /rest/api/3/myself.${gatewayNote} If this is a scoped API token, verify its Jira read scopes. Otherwise confirm JIRA_EMAIL and JIRA_API_TOKEN are from the same Atlassian account.` });
      }
      if (accountResponse.status === 403) {
        return reply(502, { error: "Jira returned HTTP 403 while checking /rest/api/3/myself. Check whether this Atlassian account or token is restricted from API access to this Jira site." });
      }
      if (!accountResponse.ok)
        return reply(502, { error: "Jira could not verify the configured account." });
      account = await accountResponse.json();
    }
    const searchResponse = await fetch(new URL("rest/api/3/search/jql", apiBase), {
      method: "POST",
      headers: jiraHeaders,
      body: JSON.stringify({
        jql: "assignee = currentUser() AND statusCategory != 3 ORDER BY priority DESC, created ASC",
        maxResults: 50,
        fields: issueFields,
      }),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (searchResponse.status === 401)
      return reply(502, { error: "Jira returned HTTP 401 while searching assigned issues. The Jira email and API token were not accepted." });
    if (searchResponse.status === 403)
      return reply(502, { error: "Jira returned HTTP 403 while searching assigned issues. The account authenticated, but Jira denied issue search. Check project access, Browse Projects permission, issue security, and any API token restrictions." });
    if (!searchResponse.ok)
      return reply(502, { error: "Jira issue sync failed. Please retry." });

    const search = await searchResponse.json();
    const issues = (Array.isArray(search.issues) ? search.issues : []).map(
      (issue: any) => ({
        key: String(issue.key || ""),
        summary: String(issue.fields?.summary || "Untitled issue"),
        status: String(issue.fields?.status?.name || "Unknown"),
        issueType: String(issue.fields?.issuetype?.name || "Issue"),
        priority: issue.fields?.priority?.name
          ? String(issue.fields.priority.name)
          : null,
        project: String(issue.fields?.project?.name || issue.fields?.project?.key || ""),
        updated: issue.fields?.updated ? String(issue.fields.updated) : null,
        url: new URL(`browse/${encodeURIComponent(String(issue.key || ""))}`, site).toString(),
      }),
    );

    return reply(200, {
      connected: true,
      account: {
        accountId: String(account.accountId || ""),
        displayName: String(account.displayName || "Jira account"),
      },
      issues,
      syncedAt: new Date().toISOString(),
    });
  } catch {
    return reply(502, { error: "Jira connection failed. Check the server settings." });
  }
});
