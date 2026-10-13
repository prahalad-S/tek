import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const cloud = process.env.JARVIS_MODE === "cloud";
const port = Number(process.env.JARVIS_PORT || 4318);
const root = await fs.realpath(
  process.env.JARVIS_PROJECT_ROOT || process.cwd(),
);
const owner = process.env.JARVIS_OWNER_USER_ID;
const sb = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
if (!owner || !sb || !anon)
  throw new Error(
    "Set the owner user ID, Supabase URL and public key in the private companion environment file.",
  );
if (new URL(sb).protocol !== "https:")
  throw new Error("Supabase URL must use HTTPS.");
const secret = cloud
  ? process.env.JARVIS_WORKER_SECRET
  : randomBytes(32).toString("hex");
if (!secret || secret.length < 32)
  throw new Error(
    "Cloud mode requires a worker secret of at least 32 characters.",
  );
const dataDir = path.join(os.homedir(), ".tek-jarvis");
await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
if (!cloud) {
  await fs.writeFile(
    path.join(dataDir, "pairing.json"),
    JSON.stringify({
      code: secret,
      expires: new Date(Date.now() + 8 * 3600000).toISOString(),
      port,
    }),
    { mode: 0o600 },
  );
  console.log(
    `Pairing details saved to ${path.join(dataDir, "pairing.json")}. Session expires in 8 hours.`,
  );
}
const origins = new Set(
  (process.env.APP_ORIGIN || "http://127.0.0.1:5173,http://localhost:5173")
    .split(",")
    .map((x) => x.trim()),
);
let committedFileHashes = {};
let occupied = false,
  changedPaths = [],
  lastCommit = null;
const safe = (p) =>
  typeof p === "string" &&
  p.length < 240 &&
  !p.includes("\\") &&
  !p.includes(":") &&
  !p.startsWith("/") &&
  !p
    .split("/")
    .some(
      (v) =>
        !v ||
        v === ".." ||
        v.startsWith(".") ||
        [
          "node_modules",
          "dist",
          "build",
          "coverage",
          "private-backup",
          "private-migration",
          "vendor",
          "tools",
        ].includes(v),
    ) &&
  !/(^|\/)(secrets?|credentials)(\.|$)/i.test(p) &&
  /\.(html?|css|scss|js|jsx|mjs|ts|tsx|json|md|txt|svg)$/i.test(p);
async function filePath(relative) {
  if (!safe(relative)) throw new Error("File path is not permitted.");
  const target = path.resolve(root, ...relative.split("/"));
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error("File is outside the approved project.");
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink())
        throw new Error("Symlinks and junctions are not supported.");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  return target;
}
const hash = (text) => createHash("sha256").update(text).digest("hex");
async function snapshot() {
  const files = {},
    hashes = {};
  let total = 0;
  async function walk(dir, prefix = "") {
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      if (
        item.isSymbolicLink() ||
        item.name.startsWith(".") ||
        [
          "node_modules",
          "dist",
          "build",
          "coverage",
          "private-backup",
          "private-migration",
          "vendor",
          "tools",
        ].includes(item.name)
      )
        continue;
      const relative = prefix + item.name;
      if (item.isDirectory()) {
        if (relative.split("/").length < 8)
          await walk(path.join(dir, item.name), relative + "/");
      } else if (safe(relative)) {
        const target = await filePath(relative);
        if ((await fs.stat(target)).size > 150000) continue;
        const content = await fs.readFile(target, "utf8");
        total += content.length;
        if (Object.keys(files).length >= 200 || total > 1000000)
          throw new Error(
            "Snapshot exceeds 200 files or 1 MB. Use a smaller approved workspace.",
          );
        files[relative] = content;
        hashes[relative] = hash(content);
      }
    }
  }
  await walk(root);
  return { files, hashes, project: path.basename(root) };
}
function cleanEnvironment() {
  const env = {};
  for (const name of [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "ProgramFiles",
    "SSH_AUTH_SOCK",
  ])
    if (process.env[name]) env[name] = process.env[name];
  env.GIT_TERMINAL_PROMPT = "0";
  return env;
}
async function command(binary, args, timeout = 120000) {
  try {
    const result = await exec(binary, args, {
      cwd: root,
      env: cleanEnvironment(),
      timeout,
      maxBuffer: 1000000,
      windowsHide: true,
    });
    return (result.stdout + "\n" + result.stderr).slice(-18000);
  } catch {
    throw new Error(
      "Command failed or timed out. Check project configuration and Git authentication in your terminal.",
    );
  }
}
const git = (...args) => command("git", args);
const gitStatus = () => git("status", "--short");
async function assertRemote() {
  const remote = (await git("remote", "get-url", "origin")).trim();
  if (
    !/^(https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?|git@github\.com:[\w.-]+\/[\w.-]+(?:\.git)?)$/.test(
      remote,
    )
  )
    throw new Error(
      "Origin must be a GitHub repository without embedded credentials.",
    );
}
async function bodyOf(req) {
  let size = 0,
    raw = "";
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2000000) throw new Error("Request too large.");
    raw += chunk;
  }
  return JSON.parse(raw);
}
const started = Date.now();
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin ?? "";
  const allowed = cloud ? !origin : origins.has(origin);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
  if (!cloud && allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader(
      "Access-Control-Allow-Headers",
      "authorization, content-type, x-companion-code",
    );
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  const reply = (status, value) => {
    res.statusCode = status;
    res.end(JSON.stringify(value));
  };
  if (!allowed) return reply(403, { error: "Origin is not permitted." });
  if (req.method === "OPTIONS" && !cloud) {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST" || req.url !== "/api")
    return reply(404, { error: "Endpoint not found." });
  if (
    !cloud &&
    !["127.0.0.1", "localhost"].includes((req.headers.host || "").split(":")[0])
  )
    return reply(403, { error: "Invalid host." });
  const supplied = String(
    req.headers[cloud ? "x-worker-secret" : "x-companion-code"] || "",
  );
  if (
    Buffer.byteLength(supplied) !== Buffer.byteLength(secret) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret)) ||
    (!cloud && Date.now() - started > 8 * 3600000)
  )
    return reply(401, {
      error: "Pairing session is invalid or expired. Restart and pair again.",
    });
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer "))
    return reply(401, { error: "Sign into the portal first." });
  let ownsLock = false;
  try {
    const verify = await fetch(new URL("/auth/v1/user", sb), {
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: auth, apikey: anon },
    });
    if (!verify.ok) return reply(401, { error: "Portal session expired." });
    if ((await verify.json()).id !== owner)
      return reply(403, {
        error: "This worker belongs to another portal user.",
      });
    if (occupied) return reply(409, { error: "Another operation is running." });
    occupied = true;
    ownsLock = true;
    const body = await bodyOf(req);
    let result;
    switch (body.action) {
      case "status":
        result = {
          mode: cloud ? "cloud" : "local",
          project: path.basename(root),
          gitStatus: await gitStatus(),
        };
        break;
      case "files":
        result = await snapshot();
        break;
      case "apply": {
        if (
          !Array.isArray(body.changes) ||
          !body.changes.length ||
          body.changes.length > 20
        )
          throw new Error("Choose up to 20 reviewed changes.");
        const originals = [],
          seen = new Set();
        for (const change of body.changes) {
          if (
            seen.has(change.path) ||
            typeof change.content !== "string" ||
            change.content.length > 150000
          )
            throw new Error("Invalid change.");
          seen.add(change.path);
          const target = await filePath(change.path);
          let original = null;
          try {
            original = await fs.readFile(target, "utf8");
          } catch (e) {
            if (e.code !== "ENOENT") throw e;
          }
          if (
            (original === null ? null : hash(original)) !== change.expectedHash
          )
            throw new Error(
              `File changed since review: ${change.path}. Reload before applying.`,
            );
          originals.push({ target, original, change });
        }
        const written = [];
        try {
          for (const item of originals) {
            await fs.mkdir(path.dirname(item.target), { recursive: true });
            written.push(item);
            await fs.writeFile(item.target, item.change.content);
          }
        } catch (e) {
          for (const item of written.reverse()) {
            if (item.original === null) await fs.unlink(item.target);
            else await fs.writeFile(item.target, item.original);
          }
          throw e;
        }
        changedPaths = originals.map((item) => item.change.path);
        committedFileHashes = Object.fromEntries(
          originals.map((item) => [
            item.change.path,
            hash(item.change.content),
          ]),
        );
        result = {
          message: `Applied ${changedPaths.length} reviewed files.`,
          paths: changedPaths,
        };
        break;
      }
      case "open": {
        if (cloud) throw new Error("VS Code opening is local only.");
        const locations =
          process.platform === "win32"
            ? [
                path.join(
                  process.env.LOCALAPPDATA || "",
                  "Programs",
                  "Microsoft VS Code",
                  "Code.exe",
                ),
                path.join(
                  process.env.ProgramFiles || "",
                  "Microsoft VS Code",
                  "Code.exe",
                ),
              ]
            : ["/Applications/Visual Studio Code.app/Contents/MacOS/Electron", "/usr/bin/code", "/usr/local/bin/code"];
        if (process.env.JARVIS_EDITOR_EXE) {
          if (!path.isAbsolute(process.env.JARVIS_EDITOR_EXE))
            throw new Error(
              "JARVIS_EDITOR_EXE must be an absolute executable path.",
            );
          locations.unshift(process.env.JARVIS_EDITOR_EXE);
        }
        let exe;
        for (const item of locations) {
          try {
            await fs.access(item);
            exe = item;
            break;
          } catch {}
        }
        if (!exe)
          throw new Error(
            "Set JARVIS_EDITOR_EXE in the companion environment to your VS Code executable path.",
          );
        const child = spawn(exe, [root], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
          env: cleanEnvironment(),
        });
        await new Promise((resolve, reject) => {
          child.once("spawn", resolve);
          child.once("error", () =>
            reject(
              new Error(
                "Could not launch VS Code. Check JARVIS_EDITOR_EXE.",
              ),
            ),
          );
        });
        child.unref();
        result = { message: "Opened approved project in VS Code." };
        break;
      }
      case "fetch":
        await assertRemote();
        result = { message: await git("fetch", "origin") };
        break;
      case "pull":
        await assertRemote();
        if ((await gitStatus()).trim())
          throw new Error("Commit or stash changes before pulling.");
        result = { message: await git("pull", "--ff-only") };
        break;
      case "branch":
        if ((await gitStatus()).trim())
          throw new Error(
            "Create a branch with a clean working tree before making changes.",
          );
        if (!/^jarvis\/[a-z0-9][a-z0-9-]{1,60}$/.test(body.name))
          throw new Error("Use a branch name such as jarvis/dark-mode.");
        result = { message: await git("switch", "-c", body.name) };
        break;
      case "build": {
        const pkg = JSON.parse(
          await fs.readFile(path.join(root, "package.json"), "utf8"),
        );
        if (!pkg.scripts?.build) throw new Error("No npm build script exists.");
        if (body.confirmScript !== true)
          throw new Error("Approve the build script first.");
        const cli = process.env.JARVIS_NPM_CLI;
        if (!cli || !path.isAbsolute(cli))
          throw new Error("Set JARVIS_NPM_CLI to npm-cli.js.");
        result = {
          message: await command(process.execPath, [cli, "run", "build"]),
        };
        break;
      }
      case "commit": {
        if (!changedPaths.length)
          throw new Error("Apply reviewed files in this session first.");
        if (
          !(await git("branch", "--show-current")).trim().startsWith("jarvis/")
        )
          throw new Error("Commit on a jarvis/ working branch.");
        if ((await git("diff", "--cached", "--name-only")).trim())
          throw new Error(
            "Other files are staged. Review them outside Jarvis first.",
          );
        if (
          typeof body.message !== "string" ||
          !body.message.trim() ||
          body.message.length > 200 ||
          /[\r\n]/.test(body.message)
        )
          throw new Error(
            "Enter a one-line commit message under 200 characters.",
          );
        for (const relative of changedPaths) {
          const current = await fs.readFile(await filePath(relative), "utf8");
          if (hash(current) !== committedFileHashes[relative])
            throw new Error(
              `File changed after approval: ${relative}. Reload and review before committing.`,
            );
        }
        await git("add", "--", ...changedPaths);
        await git("commit", "-m", body.message);
        lastCommit = (await git("rev-parse", "HEAD")).trim();
        result = { message: "Committed reviewed changes.", commit: lastCommit };
        break;
      }
      case "push":
        await assertRemote();
        {
          const branch = (await git("branch", "--show-current")).trim();
          if (
            !branch.startsWith("jarvis/") ||
            !lastCommit ||
            (await git("rev-parse", "HEAD")).trim() !== lastCommit
          )
            throw new Error(
              "Commit reviewed files in this session before pushing.",
            );
          if ((await gitStatus()).trim())
            throw new Error("Review remaining changes before pushing.");
          result = {
            message: await git("push", "--set-upstream", "origin", branch),
            commit: lastCommit,
          };
        }
        break;
      default:
        throw new Error("Unknown operation.");
    }
    reply(200, result);
  } catch (e) {
    reply(400, { error: e.message || "Operation failed." });
  } finally {
    if (ownsLock) occupied = false;
  }
});
server.requestTimeout = 150000;
server.headersTimeout = 15000;
server.listen(port, cloud ? "0.0.0.0" : "127.0.0.1", () =>
  console.log(
    `Jarvis ${cloud ? "worker" : "companion"} ready on port ${port}. Project: ${path.basename(root)}.`,
  ),
);
