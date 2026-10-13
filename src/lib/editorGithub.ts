export type WorkspaceFiles = Record<string, string>;
export const isAsset = (path: string) =>
  /\.(png|jpe?g|gif|webp|ico|woff2?|ttf)$/i.test(path);
export function supportedPath(path: string) {
  return (
    !path
      .split("/")
      .some(
        (part) =>
          part.startsWith(".") ||
          ["node_modules", "dist", "build"].includes(part),
      ) &&
    /\.(html?|css|scss|js|jsx|ts|tsx|mjs|json|md|txt|svg|png|jpe?g|gif|webp|ico|woff2?|ttf)$/i.test(
      path,
    ) &&
    !/(^|\/)(credentials|secrets?)(\.|\/)/i.test(path)
  );
}
export function parseRepository(value: string) {
  const cleaned = value.trim().replace(/\.git\/?$/, "");
  let parts: string[];
  if (cleaned.startsWith("https://")) {
    const url = new URL(cleaned);
    if (url.hostname !== "github.com" || url.search || url.hash)
      throw new Error("Use a github.com repository URL or owner/repository.");
    parts = url.pathname.split("/").filter(Boolean);
  } else parts = cleaned.split("/");
  if (
    parts.length !== 2 ||
    !parts.every((part) => /^[\w.-]+$/.test(part)) ||
    parts.some((part) => part === "..")
  )
    throw new Error("Enter a repository such as owner/project.");
  return parts.join("/");
}
export async function githubGet<T>(
  path: string,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(`https://api.github.com/repos/${path}`, {
    signal,
    credentials: "omit",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    if (response.status === 404)
      throw new Error(
        "Repository or branch not found. Private repositories need a secure GitHub connection.",
      );
    if (response.status === 403 || response.status === 429)
      throw new Error(
        "GitHub access was restricted or its public request limit was reached. Try again later.",
      );
    throw new Error(
      `GitHub returned HTTP ${response.status}. Please try again.`,
    );
  }
  return response.json();
}
export type Repository = { full_name: string; default_branch: string };
export type Branch = { name: string };
type Tree = {
  truncated: boolean;
  sha: string;
  tree: {
    path: string;
    type: string;
    mode: string;
    sha: string;
    size?: number;
  }[];
};
export async function importRepository(
  repo: string,
  branch: string,
  signal: AbortSignal,
  progress: (value: string) => void,
) {
  const tree = await githubGet<Tree>(
    `${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    signal,
  );
  if (tree.truncated)
    throw new Error(
      "This repository is too large for browser import. Choose a smaller static website repository.",
    );
  const entries = tree.tree.filter(
    (item) =>
      item.type === "blob" &&
      item.mode !== "120000" &&
      supportedPath(item.path),
  );
  if (!entries.length)
    throw new Error("No supported web files were found on this branch.");
  if (
    entries.length > 40 ||
    entries.some((item) => (item.size ?? 0) > 1024 * 1024) ||
    entries.reduce((sum, item) => sum + (item.size ?? 0), 0) > 4 * 1024 * 1024
  )
    throw new Error(
      "Browser import supports up to 40 web files, 1 MB per file and 4 MB total. Choose a smaller repository.",
    );
  const files: WorkspaceFiles = {};
  let index = 0;
  for (const item of entries) {
    progress(`Importing ${++index} of ${entries.length}: ${item.path}`);
    const blob = await githubGet<{ content: string; encoding: string }>(
      `${repo}/git/blobs/${item.sha}`,
      signal,
    );
    if (blob.encoding !== "base64")
      throw new Error(`Could not decode ${item.path}.`);
    const bytes = Uint8Array.from(
      atob(blob.content.replace(/\s/g, "")),
      (char) => char.charCodeAt(0),
    );
    files[item.path] = isAsset(item.path)
      ? `data:${mime(item.path)};base64,${blob.content.replace(/\s/g, "")}`
      : new TextDecoder().decode(bytes);
  }
  return {
    files,
    sha: tree.sha,
    skipped:
      tree.tree.filter((item) => item.type === "blob").length - entries.length,
  };
}
export function mime(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  return (
    (
      {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        ico: "image/x-icon",
        woff: "font/woff",
        woff2: "font/woff2",
        ttf: "font/ttf",
        svg: "image/svg+xml",
      } as Record<string, string>
    )[ext ?? ""] ?? "application/octet-stream"
  );
}
export function previewDocument(files: WorkspaceFiles, entry: string) {
  const urls: string[] = [];
  const resolve = (from: string, value: string) => {
    if (/^(?:[a-z]+:|\/\/|#)/i.test(value)) return null;
    const parts = (
      value.startsWith("/")
        ? value.slice(1)
        : `${from.substring(0, from.lastIndexOf("/") + 1)}${value}`
    )
      .split(/[?#]/)[0]
      .split("/");
    const result: string[] = [];
    for (const part of parts) {
      if (part === "..") result.pop();
      else if (part && part !== ".") result.push(part);
    }
    return result.join("/");
  };
  const asset = (path: string) => {
    if (isAsset(path)) return files[path];
    const url = URL.createObjectURL(
      new Blob([files[path]], { type: mime(path) }),
    );
    urls.push(url);
    return url;
  };
  const css = (path: string, content: string) =>
    content.replace(
      /url\(\s*(['"]?)(.*?)\1\s*\)/gi,
      (original, _quote, value) => {
        const target = resolve(path, value);
        return target && target in files ? `url("${asset(target)}")` : original;
      },
    );
  const doc = new DOMParser().parseFromString(files[entry], "text/html");
  doc
    .querySelectorAll('base,meta[http-equiv="Content-Security-Policy" i]')
    .forEach((node) => node.remove());
  const nonce = crypto.randomUUID();
  const policy = doc.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content =
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob: https://img.freepik.com; font-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'`;
  doc.head.prepend(policy);
  const viewport = doc.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1";
  doc.head.append(viewport);
  doc
    .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    .forEach((link) => {
      const path = resolve(entry, link.getAttribute("href") ?? "");
      if (path && path in files) {
        const style = doc.createElement("style");
        style.textContent = css(path, files[path]);
        link.replaceWith(style);
      } else link.remove();
    });
  doc.querySelectorAll<HTMLStyleElement>("style").forEach((style) => {
    style.textContent = css(entry, style.textContent ?? "");
  });
  doc
    .querySelectorAll<HTMLElement>("[src]:not(script),[poster]")
    .forEach((node) => {
      for (const attr of ["src", "poster"]) {
        const value = node.getAttribute(attr);
        const path = value ? resolve(entry, value) : null;
        if (path && path in files) node.setAttribute(attr, asset(path));
      }
      node.removeAttribute("srcset");
    });
  doc.querySelectorAll<HTMLScriptElement>("script").forEach((script) => {
    const source = script.getAttribute("src");
    const path = source ? resolve(entry, source) : null;
    if (source && (!path || !(path in files))) {
      script.remove();
      return;
    }
    const code = path ? files[path] : (script.textContent ?? "");
    script.removeAttribute("src"); script.setAttribute("nonce", nonce);
    script.textContent = code.replace(/<\/script/gi, "<\\/script");
  });
  // Preserve the original three-file starter convention for HTML fragments.
  if (!/<(?:html|link|script)\b/i.test(files[entry])) {
    if (files["style.css"]) {
      const style = doc.createElement("style");
      style.textContent = css("style.css", files["style.css"]);
      doc.head.append(style);
    }
    if (files["script.js"]) {
      const script = doc.createElement("script");
      script.setAttribute("nonce", nonce);
      script.textContent = files["script.js"].replace(/<\/script/gi, "<\\/script");
      doc.body.append(script);
    }
  }
  return { html: "<!doctype html>" + doc.documentElement.outerHTML, urls };
}
