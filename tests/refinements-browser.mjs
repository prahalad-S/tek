import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
fs.mkdirSync("review/refinements", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5173/preview/people");
  await expect(page.locator(".person-card")).toHaveCount(12);
  await expect(page.locator(".assistant-promo")).toHaveCount(0);
  await expect(page.getByLabel("Sort people").locator("select")).toHaveCount(0);
  await page.getByRole("button", { name: "Descending", exact: true }).click();
  await expect(page.locator(".directory")).toHaveClass(/people-phase-idle/);
  const names = await page.locator(".person-card h3").allTextContents();
  expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
  await page.getByRole("button", { name: "Random", exact: true }).click();
  await page
    .getByRole("button", { name: "Default order", exact: true })
    .click();
  await page.locator(".person-card").first().click();
  await expect(page.locator(".expanded-person")).toBeVisible();
  await page.getByRole("button", { name: "Back to all people" }).click();
  await expect(page.locator(".person-card")).toHaveCount(12);
  await expect(page.locator(".expanded-person")).toHaveCount(0);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  for (const name of [
    "My team",
    "My projects",
    "Team projects",
    "Settings & profile",
  ])
    await expect(
      page
        .locator(".account-dropdown")
        .getByRole("link", { name, exact: true }),
    ).toBeVisible();
  await expect(
    page.locator(".account-dropdown").getByRole("button", { name: "Log out" }),
  ).toBeVisible();
  await page
    .locator(".account-dropdown")
    .getByRole("link", { name: "My team", exact: true })
    .click();
  await expect
    .poll(() => page.locator(".person-card").count())
    .toBeLessThan(12);
  await page
    .getByRole("link", { name: "Employee analytics", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Employee analytics" }),
  ).toBeVisible();
  await expect(page.locator(".analytics-donut")).toBeVisible();
  await page.screenshot({
    path: "review/refinements/analytics-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.screenshot({
    path: "review/refinements/analytics-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(page).toHaveURL(/people/);
  await page.getByRole("link", { name: "Events", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("link", { name: "Holidays", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("radio", { name: "Color bands" }).check();
  await expect(page.locator(".calendar-bands")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo last calendar change" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Calendar project").locator("option").first(),
  ).toHaveText("All Projects");
  await page.getByLabel("Calendar project").selectOption("leave");
  await expect(page.locator(".work-entry")).toHaveCount(0);
  await page.getByLabel("Calendar project").selectOption("");
  await page.screenshot({
    path: "review/refinements/calendar-bands.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Export calendar", exact: true })
    .click();
  await expect(page.getByLabel("From date", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Entry type", exact: true }),
  ).toBeVisible();
  const dp = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const dl = await dp;
  await dl.saveAs("review/refinements/calendar.csv");
  expect(fs.readFileSync("review/refinements/calendar.csv", "utf8")).toContain(
    "Hours",
  );
  await page.goto("http://127.0.0.1:5173/preview/access");
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Location", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("http://127.0.0.1:5173/preview/projects");
  await page.getByRole("button", { name: "New project" }).click();
  for (const label of ["Client name", "Country", "City"])
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("http://127.0.0.1:5173/preview/reports");
  await page
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Clear your history view?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("http://127.0.0.1:5173/preview/profile");
  await expect(page.locator(".document-tile")).toHaveCount(9);
  await page.getByRole("button", { name: "View ID card", exact: true }).click();
  await expect(page.locator("iframe.document-preview")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  const png = await page.locator(".profile-summary").screenshot();
  await page
    .locator(".profile-summary input[type=file]")
    .setInputFiles({
      name: "crop-test.png",
      mimeType: "image/png",
      buffer: png,
    });
  await expect(
    page.getByRole("heading", { name: "Crop profile photo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Rotate right", exact: true }).click();
  await page.getByRole("button", { name: "Free", exact: true }).click();
  await page.getByRole("button", { name: "1:1 Square", exact: true }).click();
  await page.screenshot({
    path: "review/refinements/photo-crop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirm & save", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Crop profile photo" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["people", "calendar", "analytics", "profile", "maps"]) {
    await page.goto("http://127.0.0.1:5173/preview/" + route);
    await page.locator(".page-heading").waitFor();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.screenshot({
    path: "review/refinements/mobile.png",
    fullPage: true,
  });
  if (errors.length) throw Error(errors.join("\n"));
  console.log("Refinements browser checks passed.");
} finally {
  await browser.close();
}
