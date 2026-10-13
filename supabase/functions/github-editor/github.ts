export class Fault extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function repositoryName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[\w-]+\/[\w.-]+$/.test(value) ||
    value.split("/").some((p) => [".", ".."].includes(p))
  )
    throw new Fault(400, "Use an owner/repository name.");
  return value;
}
export function branchName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 200 ||
    /[\x00-\x20\x7f~^:?*\[\\]/.test(value) ||
    value.includes("..") ||
    value.includes("@{") ||
    value
      .split("/")
      .some(
        (p) =>
          !p || p.startsWith(".") || p.endsWith(".") || p.endsWith(".lock"),
      )
  )
    throw new Fault(400, "Choose a valid branch name.");
  return value;
}
const allowedPath = (path: string) =>
  path.length <= 300 &&
  !path.includes("\\") &&
  !path.includes("\0") &&
  !path
    .split("/")
    .some(
      (p) =>
        !p ||
        p.startsWith(".") ||
        [
          "node_modules",
          "dist",
          "build",
          "private-backup",
          "private-migration",
        ].includes(p),
    ) &&
  !/(^|\/)(credentials|secrets?)(\.|\/|$)/i.test(path) &&
  /\.(html?|css|scss|js|jsx|ts|tsx|mjs|json|md|txt|svg|png|jpe?g|gif|webp|ico|woff2?|ttf)$/i.test(
    path,
  );
const binary = (path: string) =>
  /\.(png|jpe?g|gif|webp|ico|woff2?|ttf)$/i.test(path);
const mime = (path: string) =>
  (
    ({
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      ico: "image/x-icon",
      woff: "font/woff",
      woff2: "font/woff2",
      ttf: "font/ttf",
    }) as Record<string, string>
  )[path.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";
type TreeEntry = {
  path: string;
  type: string;
  mode: string;
  sha: string;
  size?: number;
};
type Tree = { truncated: boolean; tree: TreeEntry[] };
type Commit = { sha: string; tree: { sha: string } };
type RepoInfo = {
  private?: boolean;
  homepage?: string;
  full_name: string;
  default_branch: string;
  archived?: boolean;
  disabled?: boolean;
  permissions?: { push?: boolean };
};
export class GitHub {
  constructor(
    private token: string,
    public repository: string,
  ) {}
  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const response = await fetch(
      `https://api.github.com/repos/${this.repository}${path}`,
      {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(25000),
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const status = response.status;
      await response.body?.cancel();
      if (status === 401)
        throw new Fault(
          401,
          "GitHub rejected the server token. Replace the expired or invalid GITHUB_EDITOR_TOKEN in Supabase secrets.",
        );
      if (status === 403 || status === 429)
        throw new Fault(
          status,
          "GitHub denied this request. Check that the token selects this repository with Contents: Read and write, any organization approval, branch rules, and GitHub rate limits.",
        );
      if (status === 404)
        throw new Fault(
          404,
          "GitHub could not find this repository, branch or commit with the configured token. Check repository selection and Contents access.",
        );
      if (status === 409 || status === 422)
        throw new Fault(
          409,
          "GitHub could not update this branch. It may have changed since import or require a pull request. Export your edits, check the branch rules and import again.",
        );
      throw new Fault(
        502,
        `GitHub returned HTTP ${status}. Editor changes are preserved; check GitHub before retrying a push.`,
      );
    }
    return response.json();
  }
  async info() {
    const info = await this.request<RepoInfo>("");
    if (info.archived || info.disabled || info.permissions?.push === false)
      throw new Fault(
        403,
        "This repository is read-only for the configured GitHub account.",
      );
    return info;
  }
  async head(branch: string) {
    const ref = await this.request<{ object: { sha: string; type: string } }>(
      `/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    if (ref.object.type !== "commit")
      throw new Fault(400, "Choose a branch pointing to a commit.");
    return ref.object.sha;
  }
}
async function sourceTree(github: GitHub, commitSha: string) {
  const commit = await github.request<Commit>(`/git/commits/${commitSha}`);
  const tree = await github.request<Tree>(
    `/git/trees/${commit.tree.sha}?recursive=1`,
  );
  if (tree.truncated)
    throw new Fault(
      413,
      "This repository is too large for browser import. Use a smaller static project.",
    );
  return { commit, tree };
}
export async function snapshot(github: GitHub, branch: string) {
  const sha = await github.head(branch);
  const { tree } = await sourceTree(github, sha);
  const entries = tree.tree.filter(
    (item) =>
      item.type === "blob" &&
      ["100644", "100755"].includes(item.mode) &&
      allowedPath(item.path),
  );
  if (!entries.length)
    throw new Fault(400, "No supported web files were found on this branch.");
  if (
    entries.length > 40 ||
    entries.some((item) => (item.size ?? 0) > 1024 * 1024) ||
    entries.reduce((n, item) => n + (item.size ?? 0), 0) > 4 * 1024 * 1024
  )
    throw new Fault(
      413,
      "Import supports up to 40 files, 1 MB per file and 4 MB total.",
    );
  const files: Record<string, string> = Object.create(null);
  let total = 0;
  for (let index = 0; index < entries.length; index += 5) {
    await Promise.all(
      entries.slice(index, index + 5).map(async (item) => {
        const blob = await github.request<{
          encoding: string;
          content: string;
        }>(`/git/blobs/${item.sha}`);
        if (blob.encoding !== "base64")
          throw new Fault(400, "Could not decode a GitHub file.");
        const content = blob.content.replace(/\s/g, "");
        const bytes = Uint8Array.from(atob(content), (char) =>
          char.charCodeAt(0),
        );
        total += bytes.length;
        if (bytes.length > 1024 * 1024 || total > 4 * 1024 * 1024)
          throw new Fault(413, "Files exceed the editor import limit.");
        files[item.path] = binary(item.path)
          ? `data:${mime(item.path)};base64,${content}`
          : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      }),
    );
  }
  return {
    files,
    repository: github.repository,
    branch,
    commitSha: sha,
    skipped:
      tree.tree.filter((item) => item.type === "blob").length - entries.length,
  };
}
type Change = { path: string; content: string };
export async function publish(
  github: GitHub,
  branch: string,
  base: unknown,
  message: unknown,
  changes: unknown,
) {
  if (typeof base !== "string" || !/^[a-f0-9]{40}$/i.test(base))
    throw new Fault(
      400,
      "Import this branch through the secure GitHub connection before pushing.",
    );
  if (
    typeof message !== "string" ||
    !message.trim() ||
    message.trim().length > 200 ||
    /[\r\n\x00]/.test(message)
  )
    throw new Fault(
      400,
      "Enter a one-line commit message of up to 200 characters.",
    );
  if (!Array.isArray(changes) || !changes.length || changes.length > 40)
    throw new Fault(400, "Push between 1 and 40 changed files.");
  const normalized: {
    path: string;
    content: string;
    encoding: "utf-8" | "base64";
  }[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const change of changes as Change[]) {
    if (
      !change ||
      typeof change.path !== "string" ||
      !allowedPath(change.path) ||
      seen.has(change.path) ||
      typeof change.content !== "string"
    )
      throw new Fault(
        400,
        "Push contains an unsupported or duplicate file path.",
      );
    seen.add(change.path);
    let content = change.content,
      size: number,
      encoding: "utf-8" | "base64" = "utf-8";
    if (binary(change.path)) {
      const match = content.match(
        /^data:[\w/+.-]+;base64,([A-Za-z0-9+/]*={0,2})$/,
      );
      if (!match)
        throw new Fault(400, "A binary asset has an invalid encoding.");
      content = match[1];
      encoding = "base64";
      try {
        size = atob(content).length;
      } catch {
        throw new Fault(400, "A binary asset has an invalid encoding.");
      }
    } else size = new TextEncoder().encode(content).length;
    total += size;
    if (size > 1024 * 1024 || total > 4 * 1024 * 1024)
      throw new Fault(413, "Push supports 1 MB per file and 4 MB total.");
    normalized.push({ path: change.path, content, encoding });
  }
  await github.info();
  if ((await github.head(branch)) !== base)
    throw new Fault(
      409,
      "This GitHub branch changed since import. Export your edits and reimport the latest branch before pushing. No files were overwritten.",
    );
  const { commit, tree } = await sourceTree(github, base);
  const existing = new Map(tree.tree.map((entry) => [entry.path, entry]));
  for (const change of normalized) {
    const entry = existing.get(change.path);
    if (
      entry &&
      (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode))
    )
      throw new Fault(
        400,
        "Symlinks, submodules and folders cannot be replaced through this editor.",
      );
    const parts = change.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const parent = existing.get(parts.slice(0, i).join("/"));
      if (parent && parent.type !== "tree")
        throw new Fault(
          400,
          "A changed path conflicts with an existing repository file.",
        );
    }
  }
  const entries: { path: string; mode: string; type: string; sha: string }[] =
    [];
  for (let index = 0; index < normalized.length; index += 5) {
    await Promise.all(
      normalized.slice(index, index + 5).map(async (change) => {
        const blob = await github.request<{ sha: string }>(
          "/git/blobs",
          "POST",
          { content: change.content, encoding: change.encoding },
        );
        entries.push({
          path: change.path,
          type: "blob",
          mode: existing.get(change.path)?.mode ?? "100644",
          sha: blob.sha,
        });
      }),
    );
  }
  const nextTree = await github.request<{ sha: string }>("/git/trees", "POST", {
    base_tree: commit.tree.sha,
    tree: entries,
  });
  if (nextTree.sha === commit.tree.sha)
    throw new Fault(400, "There are no content changes to push.");
  const next = await github.request<{ sha: string }>("/git/commits", "POST", {
    message: message.trim(),
    tree: nextTree.sha,
    parents: [base],
  });
  // Only publish once all files form one commit. A concurrent branch update fails instead of being overwritten.
  await github.request(
    `/git/refs/heads/${encodeURIComponent(branch)}`,
    "PATCH",
    { sha: next.sha, force: false },
  );
  return {
    commitSha: next.sha,
    repository: github.repository,
    branch,
    url: `https://github.com/${github.repository}/commit/${next.sha}`,
  };
}
