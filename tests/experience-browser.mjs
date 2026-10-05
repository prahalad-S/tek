import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
fs.mkdirSync("review/experience", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const go = (route) => page.goto("http://127.0.0.1:5173/preview/" + route);
const idle = () =>
  expect(page.locator(".directory")).toHaveClass(/people-phase-idle/);
try {
  await go("people");
  await expect(page.locator(".person-card")).toHaveCount(12);
  await page.locator(".person-card").first().click();
  await idle();
  const selected = await page
    .locator(".expanded-person")
    .getAttribute("data-person-id");
  const rail = await page
    .locator(".avatar-rail [data-person-id]")
    .evaluateAll((ns) => ns.map((n) => n.dataset.personId));
  await page.locator(".avatar-rail [data-person-id]").nth(2).click();
  await idle();
  expect(
    await page.locator(".expanded-person").getAttribute("data-person-id"),
  ).toBe(rail[2]);
  const after = await page
    .locator(".avatar-rail [data-person-id]")
    .evaluateAll((ns) => ns.map((n) => n.dataset.personId));
  expect(after).toEqual(rail.map((id, i) => (i === 2 ? selected : id)));
  await page.getByRole("button", { name: "Back to all people" }).click();
  await idle();
  await expect(page.locator(".person-card")).toHaveCount(12);
  await go("calendar");
  await expect(page.locator(".work-calendar-day").first()).toBeVisible();
  const today = new Date();
  const key = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const a = key(today),
    next = new Date(today);
  next.setDate(next.getDate() + 1);
  const b = key(next);
  const old = page
    .locator(".work-calendar-day")
    .filter({ has: page.locator('[aria-label="Restricted date"]') })
    .first();
  await old.locator(".day-number").click();
  await expect(
    page.getByRole("heading", { name: "Access restricted", exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Add a calendar entry" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await page.locator("select[name=project]").selectOption("p1");
  await page
    .getByLabel("What did you work on?")
    .fill("Undo integration sample");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await page.getByLabel("Search calendar").fill("Undo integration sample");
  const source = page
    .locator(`[data-date="${a}"]`)
    .getByText("Undo integration sample", { exact: true });
  await expect(source).toBeVisible();
  await source.dragTo(page.locator(`[data-date="${b}"]`));
  await expect(
    page
      .locator(`[data-date="${b}"]`)
      .getByText("Undo integration sample", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo last calendar change" }).click();
  await expect(source).toBeVisible();
  await page.getByRole("button", { name: "Undo last calendar change" }).click();
  await expect(
    page.getByText("Undo integration sample", { exact: true }),
  ).toHaveCount(0);
  await go("analytics");
  await expect(page.locator("tbody tr")).toHaveCount(12);
  await page.getByLabel("Analytics employee status").selectOption("left");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByLabel("Analytics qualification").selectOption("MBA");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByRole("button", { name: "Employee", exact: true }).click();
  await expect(page.locator("th").first()).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  await page.screenshot({
    path: "review/experience/analytics.png",
    fullPage: true,
  });
  await go("profile");
  await page.getByRole("button", { name: "Add skill", exact: true }).click();
  await page
    .getByPlaceholder("Type a skill and press Enter")
    .fill("Accessibility");
  await page.getByPlaceholder("Type a skill and press Enter").press("Enter");
  await page.getByRole("button", { name: "React", exact: true }).click();
  await page.getByRole("button", { name: "Apply skills" }).click();
  await expect(page.locator("textarea[name=skills]")).toHaveValue(
    /Accessibility/,
  );
  await expect(page.locator("textarea[name=skills]")).toHaveValue(/React/);
  await page.getByRole("button", { name: "View Resume", exact: true }).click();
  await expect(page.locator("iframe.document-preview")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await (await download).saveAs("review/experience/resume.pdf");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await go("projects");
  await page.locator(".project-card").first().click();
  await expect(page.locator(".project-editor-columns")).toBeVisible();
  await page.screenshot({ path: "review/experience/project.png" });
  await go("maps");
  await expect(page.locator(".employee-map")).toBeVisible();
  await expect(page.locator(".person-map-marker").first()).toBeVisible();
  await page.screenshot({ path: "review/experience/maps.png" });
  await page.locator(".person-map-marker").last().click();
  await expect(page).toHaveURL(/people\?person=/);
  await expect(page.locator(".expanded-person")).toBeVisible();
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(page).toHaveURL(/maps/);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["people", "analytics", "maps", "profile"]) {
    await go(route);
    await page.locator(".page-heading").waitFor();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
  console.log("Experience integration checks passed.");
} finally {
  await browser.close();
}
