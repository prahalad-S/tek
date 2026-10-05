import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
fs.mkdirSync("review", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXECUTABLE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173/preview/people");
await page
  .getByRole("heading", { name: "Good people. Great things." })
  .waitFor();
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "review/people-light.png", fullPage: true });
await page.getByRole("textbox", { name: "Search people" }).fill("Maya");
await expect(page.locator(".person-card")).toHaveCount(1);
await page.locator(".person-card").click();
await page.locator(".expanded-person").waitFor();
await page.getByRole("heading", { name: "Maya Chen", exact: true, level:2 }).waitFor();
await page.getByRole("button", { name: "Back to all people" }).click();
await page.getByRole("button", { name: "Clear search" }).click();
await page.getByLabel("Filter department").selectOption("Engineering");
await expect(page.locator(".person-card")).toHaveCount(4);
await page.getByLabel("Filter department").selectOption("");
await page.getByRole("button", { name: "List view" }).click();
await expect(page.locator(".people-grid--list")).toBeVisible();
await page.getByRole("button", { name: "Card view" }).click();
await page.getByRole("button", { name: "Toggle color theme" }).click();
await page.screenshot({ path: "review/people-dark.png", fullPage: true });
await page.getByRole("link", { name: "My timesheet", exact: true }).click();
await page.getByRole("heading", { name: "Your week, in focus." }).waitFor();
await page.getByRole("button", { name: "Add entry", exact: true }).click();
await page.getByLabel("What did you work on?").fill("A test entry");
await page.locator("select[name=project]").selectOption("p1");
await page.getByRole("button", { name: "Save entry", exact: true }).click();
await page
  .getByText("Preview only. Your sample data stays unchanged.")
  .waitFor();
await page.getByRole("button", { name: "Dismiss notification" }).click();
await page.getByRole("button", { name: "Review & submit" }).click();
await page.getByRole("heading", { name: "Ready for review?" }).waitFor();
await page.getByRole("button", { name: "Keep editing" }).click();
await page.screenshot({ path: "review/timesheet-dark.png", fullPage: true });
await page.getByRole("button", { name: "Toggle color theme" }).click();
await page.getByRole("link", { name: "Overview", exact: true }).click();
await page.getByRole("heading", { name: /A good day starts here/ }).waitFor();
await page.screenshot({ path: "review/overview-light.png", fullPage: true });
await page.getByRole("button", { name: "Ask Jarvis" }).click();
await page
  .getByRole("heading", { name: "A little help from Jarvis" })
  .waitFor();
await page.getByRole("button", { name: "What can you help with?" }).click();
await page.getByRole("button", { name: "Send message to Jarvis" }).click();
await page
  .getByText(/This is a design preview, not a live AI response/)
  .waitFor();
await page.screenshot({ path: "review/assistant.png", fullPage: true });
await page.getByRole("button", { name: "Close dialog" }).click();
for (const path of [
  "projects",
  "calendar",
  "profile",
  "documents",
  "leave",
  "approvals",
  "access",
  "reports",
]) {
  await page.goto("http://127.0.0.1:5173/preview/" + path);
  await page.locator("h1").waitFor();
  if (
    await page.getByText("This page encountered an unexpected error.").count()
  )
    throw new Error("Page failed: " + path);
}
await page.goto("http://127.0.0.1:5173/preview/calendar");
await page
  .getByRole("button", { name: "Events & holidays", exact: true })
  .click();
await page
  .getByRole("button", { name: "Add event or holiday", exact: true })
  .click();
await page
  .getByRole("dialog")
  .locator("select")
  .first()
  .selectOption("holiday");
await page.getByLabel("Name", { exact: true }).fill("Team holiday");
await page.getByRole("button", { name: "Save calendar item" }).click();
await page.getByText("Preview only. No calendar changes saved.").waitFor();
await page.getByRole('button',{name:'Close dialog'}).click();
if(await page.getByRole('button',{name:'Dismiss notification'}).isVisible())await page.getByRole('button',{name:'Dismiss notification'}).click();
await page.goto("http://127.0.0.1:5173/preview/projects");
await page.locator(".project-card").first().click();
await page
  .getByRole("heading", { name: "Project team", exact: true })
  .waitFor();
await page.getByRole("button", { name: "Close dialog" }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("http://127.0.0.1:5173/preview/people");
await page
  .getByRole("heading", { name: "Good people. Great things." })
  .waitFor();
if (
  await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
)
  throw new Error("Mobile horizontal overflow");
await page.screenshot({ path: "review/people-mobile.png", fullPage: true });
await page.getByRole("button", { name: "Open navigation" }).click();
await page.getByRole("link", { name: "My timesheet", exact: true }).click();
await page.getByRole("heading", { name: "Your week, in focus." }).waitFor();
if (
  await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
)
  throw new Error("Mobile timesheet horizontal overflow");
await page.screenshot({ path: "review/timesheet-mobile.png", fullPage: true });
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto("http://127.0.0.1:5173/login");
await page
  .getByRole("heading", { name: "Welcome to your workspace" })
  .waitFor();
await page.screenshot({ path: "review/login.png", fullPage: true });
const configurationNotice = page.getByText(
  "Live sign-in will be available once your Supabase project is connected.",
);
if (await configurationNotice.isVisible()) {
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
} else {
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
}
await browser.close();
if (errors.length) throw new Error(errors.join("\n"));
console.log(
  "Browser smoke passed: directory search/filter/list/profile; timesheet draft and submission review; assistant preview; all routes; mobile navigation/overflow; authentication configuration state.",
);
