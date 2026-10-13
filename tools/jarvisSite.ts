import type { Plugin } from "vite";
import { chromium } from "playwright";
// Local-only authenticated capture. No GitHub/Jira secrets or project sources are sent to an AI service.
export function jarvisSite(env: Record<string, string>): Plugin {
  let occupied = false;
  return { name: "jarvis-published-site", configureServer(server) {
    server.middlewares.use("/api/jarvis/site", async (req, res) => {
      const reply = (status: number, body: unknown) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(body)); };
      if (req.method !== "POST") { reply(405, { error: "POST required" }); return; }
      const host = req.headers.host || "";
      if (!/^(?:localhost|127\.0\.0\.1):\d+$/.test(host) || req.headers.origin !== `http://${host}`) { reply(403, { error: "Local portal requests only" }); return; }
      let acquired = false;
      let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
      try {
        if (occupied) { reply(409, { error: "A website inspection is already running" }); return; }
        const authorization = req.headers.authorization;
        if (!authorization?.startsWith("Bearer ")) { reply(401, { error: "Sign in before inspecting a website" }); return; }
        const auth = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/user`, { headers: { authorization, apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY || "" }, signal: AbortSignal.timeout(15000) });
        if (!auth.ok) { reply(401, { error: "Portal session could not be verified" }); return; }
        let raw = "";
        for await (const chunk of req) { raw += chunk; if (raw.length > 2000000) throw new Error("Request too large"); }
        const body = JSON.parse(raw);
        if (!/^[\w-]+\/[\w.-]+$/.test(body.repository || "")) throw new Error("Invalid repository");
        const [owner, repo] = body.repository.split("/");
        const metadata = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { signal: AbortSignal.timeout(15000) });
        if (!metadata.ok) throw new Error("Could not read the public repository website link");
        const info = await metadata.json();
        if (info.private || !info.homepage) throw new Error("The public repository has no website URL configured in GitHub About");
        const website = new URL(info.homepage);
        if (website.protocol !== "https:" || website.hostname.toLowerCase() !== `${owner.toLowerCase()}.github.io` || website.port || website.username || website.password || !website.pathname.toLowerCase().startsWith(`/${repo.toLowerCase()}/`)) throw new Error("Automatic website inspection currently supports this repository's GitHub Pages URL only");
        if (occupied) throw new Error("A website inspection is already running");
        occupied = true; acquired = true;
        browser = await chromium.launch({ channel: "msedge", headless: true });
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
        await context.setExtraHTTPHeaders({ "Cache-Control": "no-cache" });
        await context.route("**/*", route => {
          const url = new URL(route.request().url());
          return url.origin === website.origin || ["data:", "blob:"].includes(url.protocol) ? route.continue() : route.abort();
        });
        const page = await context.newPage();
        await page.goto(website.href, { waitUntil: "networkidle", timeout: 30000 });
        if (body.mode === "capture") {
          const changes = body.changes;
          if (!Array.isArray(changes) || !changes.length || changes.length > 20) throw new Error("Expected published file changes are required before capture");
          for (const change of changes) if (typeof change.content !== "string" || !/^[a-zA-Z0-9_./-]+\.(?:html?|css|js)$/.test(change.path) || change.path.split("/").includes("..")) throw new Error("Invalid published file check");
          const deadline = Date.now() + 90000;
          let current = false;
          while (Date.now() < deadline) {
            if (res.destroyed) throw new Error("Request stopped");
            current = true;
            for (const change of changes) {
              const url = new URL(change.path, website); url.searchParams.set("jarvis_verify", String(Date.now()));
              const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000) });
              if (!response.ok || (await response.text()).replace(/\r\n/g, "\n").trim() !== change.content.replace(/\r\n/g, "\n").trim()) { current = false; break; }
            }
            if (current) break;
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          if (!current) throw new Error("GitHub Pages has not published the changed files yet. No stale screenshot was attached. Retry after deployment finishes");
          await page.reload({ waitUntil: "networkidle", timeout: 30000 });
          await page.waitForTimeout(2000);
          const png = await page.screenshot({ type: "png", fullPage: false });
          if (png.length > 1500000) throw new Error("Website screenshot exceeds the Jira attachment limit");
          reply(200, { website: website.href, screenshot: `data:image/png;base64,${png.toString("base64")}` });
        } else {
          const elements = await page.locator("body *").evaluateAll(nodes => nodes.filter(node => node instanceof HTMLElement).map(node => {
            const element = node as HTMLElement, rect = element.getBoundingClientRect(), style = getComputedStyle(element);
            const parts: string[] = [];
            for (let current: Element | null = element; current; current = current.parentElement) {
              const siblings = current.parentElement ? Array.from(current.parentElement.children).filter(sibling => sibling.tagName === current!.tagName) : [current];
              parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`);
            }
            return { domPath: parts.join(" > "), fullText: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0,4000), childCount: element.children.length, tag: element.tagName.toLowerCase(), id: element.id, classes: Array.from(element.classList), text: (element.textContent || "").trim().slice(0,120), background: style.backgroundColor, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          }).filter(element => element.width > 0 && element.height > 0).slice(0,3000));
          reply(200, { website: website.href, elements });
        }
      } catch (error) { reply(400, { error: error instanceof Error ? error.message : "Website inspection failed" }); }
      finally { await browser?.close(); if (acquired) occupied = false; }
    });
  } };
}
