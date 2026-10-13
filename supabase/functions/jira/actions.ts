export class JiraActionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const defaultComment = "the issue has been fixed";
const statusName = "In Testing";
export async function updateTicket(apiBase: URL, site: URL, headers: Record<string, string>, accountId: string, value: unknown, commentValue?: unknown, screenshot?: unknown) {
  if (typeof value !== "string" || !/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(value)) throw new JiraActionError(400, "Choose a valid Jira issue key.");
  const key = value;
  let comment = commentValue === undefined ? defaultComment : typeof commentValue === "string" ? commentValue.trim() : "";
  if (!comment || comment.length > 3500) throw new JiraActionError(400, "Provide a task comment between 1 and 3500 characters.");
  async function request(path: string, method = "GET", body?: unknown) {
    let response: Response;
    try { response = await fetch(new URL(path, apiBase), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000), redirect: "error" }); }
    catch { throw new JiraActionError(502, method === "POST" ? "Jira did not confirm the update. Check the ticket before retrying; no automatic retry was made." : "Could not read Jira to confirm this operation. Check the ticket before retrying."); }
    if (!response.ok) {
      let details = "";
      if (response.status === 400) {
        try { const error = await response.json(); details = [...(Array.isArray(error.errorMessages) ? error.errorMessages : []), ...Object.values(error.errors ?? {})].filter((s) => typeof s === "string").join(" ").slice(0, 700); } catch { /* Keep a safe fallback. */ }
      } else await response.body?.cancel();
      if (response.status === 401) throw new JiraActionError(502, "Jira rejected the account or token while updating this ticket. Check the configured account and token scopes.");
      if (response.status === 403) throw new JiraActionError(403, "Jira denied this operation. The account needs Browse Projects, Add Comments and Transition Issues permissions, and the token needs Jira comment/issue write scopes.");
      if (response.status === 404) throw new JiraActionError(404, "This ticket is not visible to the configured Jira account.");
      throw new JiraActionError(response.status === 400 ? 400 : 502, `Jira returned HTTP ${response.status}.${details ? " " + details : " Check the ticket and its workflow before retrying."}`);
    }
    return response;
  }
  const issueResponse = await request(`rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,assignee`);
  const issue = await issueResponse.json();
  if (!accountId || issue.fields?.assignee?.accountId !== accountId) throw new JiraActionError(409, "This issue is no longer assigned to the connected Jira account. Sync the assigned issues and choose again. No update was submitted.");
  const currentStatus = String(issue.fields?.status?.name ?? "");

  const alreadyTesting = currentStatus.trim().toLowerCase() === statusName.toLowerCase();
  let transitionId: string | null = null;
  if (!alreadyTesting) {
    const response = await request(`rest/api/3/issue/${encodeURIComponent(key)}/transitions?expand=transitions.fields`);
    const data = await response.json();
    const transitions = Array.isArray(data.transitions) ? data.transitions : [];
    const matches = transitions.filter((t: { to?: { name?: string } }) => t.to?.name?.trim().toLowerCase() === statusName.toLowerCase());
    if (matches.length !== 1) {
      const available = [...new Set(transitions.map((t: { to?: { name?: string } }) => t.to?.name).filter(Boolean))].join(", ");
      throw new JiraActionError(409, matches.length > 1 ? "More than one transition leads to In Testing. Configure an unambiguous workflow transition. No comment was added." : `In Testing is not available from this ticket's current status (${currentStatus}).${available ? " Available destinations: " + available + "." : " Check Transition Issues permission and workflow conditions."} No comment was added.`);
    }
    transitionId = String(matches[0].id);
  }
  if (screenshot !== undefined) {
    if (typeof screenshot !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(screenshot) || screenshot.length > 2800000) throw new JiraActionError(400, "Provide a PNG screenshot smaller than 2 MB.");
    const bytes = Uint8Array.from(atob(screenshot.split(",")[1]), c => c.charCodeAt(0));
    if (bytes.length > 2097152 || bytes.slice(0,8).join(",") !== "137,80,78,71,13,10,26,10") throw new JiraActionError(400, "Invalid PNG screenshot.");
    const filename = `${key}-preview.png`;
    const form = new FormData(); form.append("file", new Blob([bytes], { type: "image/png" }), filename);
    const uploadHeaders = new Headers(headers); uploadHeaders.delete("Content-Type"); uploadHeaders.set("X-Atlassian-Token", "no-check");
    let upload: Response;
    try { upload = await fetch(new URL(`rest/api/3/issue/${key}/attachments`, apiBase), { method: "POST", headers: uploadHeaders, body: form, signal: AbortSignal.timeout(30000), redirect: "error" }); }
    catch { throw new JiraActionError(502, "Screenshot upload was not confirmed. Check Jira before retrying; comment and status were not submitted."); }
    if (!upload.ok) throw new JiraActionError(502, `Screenshot upload returned HTTP ${upload.status}. Check Create Attachments permission and token attachment scopes. Comment and status were not submitted.`);
    const attachments = await upload.json(); const attachment = attachments?.[0];
    if (!attachment?.id || attachment.filename !== filename) throw new JiraActionError(502, "Could not verify the uploaded screenshot. Check Jira before retrying.");
    const verified = await request(`rest/api/3/issue/${key}?fields=attachment`);
    if (!(await verified.json()).fields?.attachment?.some((a: { id: string }) => String(a.id) === String(attachment.id))) throw new JiraActionError(502, "Screenshot was uploaded but attachment verification failed. No comment or transition was submitted.");
    comment += `\nScreenshot: ${new URL(`secure/attachment/${encodeURIComponent(attachment.id)}/${filename}`, site)}`;
  }
  const document = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: comment }] }] };
  // Use the dedicated comment endpoint and verify the new comment by its returned ID.
  // Every explicit command adds a new comment, even if the ticket was updated before.
  let commentId = "";
  try {
    const added = await request(`rest/api/3/issue/${encodeURIComponent(key)}/comment`, "POST", { body: document });
    const saved = await added.json();
    commentId = typeof saved.id === "string" ? saved.id : "";
    if (!commentId) throw new Error("Jira returned no comment ID.");
    const check = await request(`rest/api/3/issue/${encodeURIComponent(key)}/comment/${encodeURIComponent(commentId)}`);
    const verified = await check.json();
    const textOf = (node: { text?: string; content?: unknown[] }): string =>
      typeof node?.text === "string" ? node.text : (Array.isArray(node?.content) ? node.content.map(item => textOf(item as { text?: string; content?: unknown[] })).join("") : "");
    if (String(verified.id) !== commentId || textOf(verified.body) !== comment) throw new Error("Saved comment does not match the requested text.");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Comment verification failed.";
    throw new JiraActionError(502, `${key}: could not confirm the new comment. Status change was not submitted. The comment may have been saved; check Jira before retrying. ${detail}`);
  }
  if (transitionId) {
    try {
      const moved = await request(`rest/api/3/issue/${encodeURIComponent(key)}/transitions`, "POST", { transition: { id: transitionId } });
      await moved.body?.cancel();
    } catch (error) {
      throw new JiraActionError(502, `${key}: comment was added and verified (ID ${commentId}), but Jira did not confirm the status change. Check the ticket before retrying. ${error instanceof Error ? error.message : "Transition failed."}`);
    }
  }
  try {
    const statusCheck = await request(`rest/api/3/issue/${encodeURIComponent(key)}?fields=status`);
    const updated = await statusCheck.json();
    if (String(updated.fields?.status?.name ?? "").trim().toLowerCase() !== statusName.toLowerCase()) throw new Error(`Current status is ${updated.fields?.status?.name ?? "unknown"}.`);
  } catch (error) {
    throw new JiraActionError(502, `${key}: comment was added and verified (ID ${commentId}), but final In Testing status could not be verified. Check Jira before retrying. ${error instanceof Error ? error.message : "Status verification failed."}`);
  }
  const spokenComment = comment === defaultComment ? `the comment "${comment}"` : "the comment describing your completed task";
  return { issueKey: key, status: statusName, comment, commentId, summary: alreadyTesting ? `${key}: added and verified ${spokenComment}. The ticket is already In Testing.` : `${key}: added and verified ${spokenComment} and confirmed the status is In Testing.`, url: new URL(`browse/${key}`, site).toString() };
}

export async function ticketDetails(apiBase: URL, site: URL, headers: Record<string,string>, accountId: string, key: unknown) {
  if (typeof key !== "string" || !/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(key)) throw new JiraActionError(400, "Choose a valid issue key.");
  const response = await fetch(new URL(`rest/api/3/issue/${key}?fields=summary,status,assignee,description,project,reporter,updated`, apiBase), { cache: "no-store", headers, signal: AbortSignal.timeout(20000), redirect: "error" });
  if (!response.ok) throw new JiraActionError(502, `Jira details returned HTTP ${response.status}.`);
  const issue = await response.json();
  if (issue.fields?.assignee?.accountId !== accountId) throw new JiraActionError(409, "This issue is no longer assigned to the connected Jira account.");
  const textOf = (node: any): string => {
    if (!node || typeof node !== "object") return "";
    if (typeof node.text === "string") return node.text;
    if (node.type === "hardBreak") return "\n";
    if (node.type === "mention" || node.type === "emoji") return typeof node.attrs?.text === "string" ? node.attrs.text : "";
    if (node.type === "inlineCard") return typeof node.attrs?.url === "string" ? node.attrs.url : "";
    if (!Array.isArray(node.content)) return "";
    // Formatting divides inline text into nodes, sometimes in the middle of a word.
    // Preserve those boundaries; add separators only between block-level children.
    const blocks = new Set(["doc", "blockquote", "bulletList", "orderedList", "listItem", "table", "tableRow", "tableCell", "tableHeader", "panel"]);
    return node.content.map(textOf).join(blocks.has(node.type) ? "\n" : "");
  };
  // The reporter is not necessarily the assignor. Read the latest assignment author.
  let assignor = null;
  const first = await fetch(new URL(`rest/api/3/issue/${key}/changelog?startAt=0&maxResults=1`, apiBase), { headers, signal: AbortSignal.timeout(15000), redirect: "error" });
  if (first.ok) {
    const page = await first.json(); let end = Math.min(Number(page.total) || 0, 10000);
    for (let pages = 0; end > 0 && pages < 5 && !assignor; pages++) {
      const start = Math.max(0,end-100);
      const history = await fetch(new URL(`rest/api/3/issue/${key}/changelog?startAt=${start}&maxResults=100`, apiBase), { headers, signal: AbortSignal.timeout(15000), redirect: "error" });
      if (!history.ok) break;
      const values = (await history.json()).values || [];
      const change = [...values].reverse().find((v: any) => v.items?.some((i: any) => i.field === "assignee" && i.to === accountId));
      if (change?.author) assignor = { name: String(change.author.displayName || ""), email: String(change.author.emailAddress || "") };
      end = start;
    }
  }
  return { key, summary: String(issue.fields?.summary || ""), description: textOf(issue.fields?.description), updated: issue.fields?.updated || null, status: String(issue.fields?.status?.name || ""), project: String(issue.fields?.project?.name || ""), assignor, reporter: { name: String(issue.fields?.reporter?.displayName || ""), email: String(issue.fields?.reporter?.emailAddress || "") }, url: new URL(`browse/${key}`,site).toString() };
}
