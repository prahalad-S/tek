import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
fs.mkdirSync("review/interaction-polish", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXECUTABLE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const idle = () =>
  expect(page.locator(".directory")).toHaveClass(/people-phase-idle/);
try {
  await page.goto("http://127.0.0.1:5173/preview/analytics");
  await expect(page.locator("tbody tr")).toHaveCount(12);
  const labels = [
    "Employee",
    "Department",
    "Joined on",
    "Status",
    "Qualifications",
    "Projects",
  ];
  for (const [index, label] of labels.entries()) {
    for (let click = 0; click < 2; click++) {
      await page.getByRole("button", { name: label, exact: true }).click();
      const direction = await page
        .locator("thead th")
        .nth(index)
        .getAttribute("aria-sort");
      const values = await page.locator("tbody tr").evaluateAll(
        (rows, col) =>
          rows.map((row) => {
            const cell = row.querySelectorAll("td")[col];
            return (
              col === 0
                ? cell.querySelector(".analytics-profile-link").textContent
                : cell.textContent
            ).trim();
          }),
        index,
      );
      const nonempty = values.filter(
        (s) => !["Not added", "Not assigned", "—"].includes(s),
      );
      const sorted = [...nonempty].sort(
        (a, b) =>
          a.localeCompare(b, undefined, {
            numeric: true,
            sensitivity: "base",
          }) * (direction === "ascending" ? 1 : -1),
      );
      expect(nonempty, `${label} ${direction}`).toEqual(sorted);
      if (index === 5)
        expect(values.slice(-3)).toEqual([
          "Not assigned",
          "Not assigned",
          "Not assigned",
        ]);
    }
  }
  await page.getByLabel("Analytics department").selectOption("Engineering");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.getByRole("button", { name: "Joined on", exact: true }).click();
  await page.goto("http://127.0.0.1:5173/preview/projects");
  await expect(page.locator(".project-card")).toHaveCount(4);
  await expect(page.locator(".project-avatar-stack")).toHaveCount(4);
  await expect(page.locator(".project-avatar-person")).toHaveCount(16);
  await page.screenshot({ path: "review/interaction-polish/projects.png" });
  const before = await page
    .locator(".project-avatar-stack")
    .evaluateAll((es) => es.map((e) => e.getAttribute("aria-label")));
  await page.reload();
  await expect(page.locator(".project-avatar-stack")).toHaveCount(4);
  expect(
    await page
      .locator(".project-avatar-stack")
      .evaluateAll((es) => es.map((e) => e.getAttribute("aria-label"))),
  ).toEqual(before);
  await page.goto("http://127.0.0.1:5173/preview/people");
  await expect(page.locator(".person-card")).toHaveCount(12);
  await page.getByLabel("Filter department").selectOption("Engineering");
  await idle();
  await expect(page.locator(".person-card")).toHaveCount(4);
  await page.getByLabel("Filter department").selectOption("");
  await idle();
  await page.getByLabel("Filter location").selectOption("London, UK");
  await idle();
  await expect(page.locator(".person-card")).toHaveCount(3);
  await page.getByLabel("Filter location").selectOption("");
  await idle();
  for (const name of ["List view", "Card view"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".directory")).toHaveClass(/people-phase-reflowing/);
    expect(
      await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.effect?.target?.dataset?.personId)
          .every((a) => a.effect.getTiming().easing === "linear"),
      ),
    ).toBe(true);
    await idle();
  }
  await page.locator(".person-card").first().click();
  await expect(page.locator(".directory")).toHaveClass(
    /people-phase-revealing/,
  );
  const header = page.locator(".expanded-person-header");
  expect(await header.evaluate((e) => getComputedStyle(e).animationName)).toBe(
    "none",
  );
  await expect(header.locator(".avatar")).toBeVisible();
  await idle();
  await page.locator(".avatar-tile").nth(1).click();
  await idle();
  await page.getByRole("button", { name: "Back to all people" }).click();
  await idle();
  await expect(page.locator(".person-card")).toHaveCount(12);
  await expect(page.locator("body > [data-flight-id]")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:5173/preview/projects");
  await expect(page.locator(".project-avatar-stack")).toHaveCount(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "Interaction polish checks passed: actual row ordering for six columns, stable project avatar stacks, linear filters/views, and visible avatar handoff.",
  );
} finally {
  await browser.close();
}
