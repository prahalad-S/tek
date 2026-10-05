import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { PDFDocument } from "pdf-lib";
fs.mkdirSync("review/enhancements", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXECUTABLE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5173/preview/people");
  await expect(page.locator(".person-card")).toHaveCount(12);
  await page.getByLabel("Filter department").selectOption("Engineering");
  await expect(page.locator(".person-card")).toHaveCount(4);
  await page.getByLabel("Filter location").selectOption("Hyderabad, IN");
  await expect(page.locator(".person-card")).toHaveCount(1);
  await page.locator(".person-card").click();
  await expect(page.locator(".expanded-person h2")).toHaveText("Jordan Lee");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to all people" }).click();
  await page.getByLabel("Filter department").selectOption("");
  await page.getByLabel("Filter location").selectOption("");
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.locator(".people-grid--list")).toBeVisible();
  await page.getByRole("button", { name: "Card view", exact: true }).click();
  await expect(page.locator(".person-card")).toHaveCount(12);
  await page
    .locator(".person-card")
    .filter({
      has: page.getByRole("heading", { name: "Alex Morgan", exact: true }),
    })
    .click();
  await expect(page.locator(".avatar-tile")).toHaveCount(11);
  await expect(page.locator(".expanded-person h2")).toHaveText("Alex Morgan");
  const before = await page
    .locator(".avatar-tile")
    .evaluateAll((items) => items.map((i) => i.title));
  const index = before.indexOf("Maya Chen");
  await page
    .getByRole("button", { name: "View Maya Chen", exact: true })
    .click();
  await expect(page.locator(".expanded-person h2")).toHaveText("Maya Chen");
  await expect(page.locator(".avatar-tile")).toHaveCount(11);
  await expect
    .poll(() =>
      page
        .locator(".avatar-tile")
        .evaluateAll((items, index) => items[index]?.title, index),
    )
    .toBe("Alex Morgan");
  const cols = await page
    .locator(".avatar-rail")
    .evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
    );
  if (cols !== 4) throw new Error("Avatar rail needs four columns");
  await page.screenshot({
    path: "review/enhancements/profile-expanded-light.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.screenshot({
    path: "review/enhancements/profile-expanded-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  for (const [kind, label] of [
    ["id_card", "ID card"],
    ["business_card", "Business card"],
    ["resume", "Resume"],
  ]) {
    await page
      .getByRole("button", { name: "View " + label, exact: true })
      .click();
    await expect(page.locator(".document-preview")).toBeVisible();
    for (const format of ["PDF", "Word"]) {
      const downloadPromise = page.waitForEvent("download");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: format, exact: true })
        .click();
      const download = await downloadPromise;
      const file = "review/enhancements/" + download.suggestedFilename();
      await download.saveAs(file);
      const bytes = fs.readFileSync(file);
      if (format === "PDF") {
        const pdf = await PDFDocument.load(bytes);
        if (pdf.getPageCount() < 1) throw Error("Empty PDF");
      } else if (bytes.subarray(0, 2).toString() !== "PK")
        throw Error("Invalid Word");
    }
    await page.getByRole("button", { name: "Close dialog" }).click();
  }
  await page.goto("http://127.0.0.1:5173/preview/calendar");
  await expect(page.locator(".work-calendar.month")).toBeVisible();
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await expect(page.locator(".mini-month")).toHaveCount(12);
  await page.screenshot({
    path: "review/enhancements/calendar-year.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.locator(".work-calendar-day")).toHaveCount(7);
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await page.getByLabel("Hours preset").selectOption("9+");
  await expect(page.locator("input[name=hours]")).toHaveValue("9");
  await page.locator("input[name=hours]").fill("10.5");
  await page.getByLabel("Entry type").selectOption("leave");
  await expect(page.locator("select[name=leave_type] option")).toHaveCount(5);
  await page.locator("select[name=duration]").selectOption("240");
  await page.getByRole("button", { name: "Close dialog" }).click();
  // Fresh dates exercise copy/drag without bypassing the historical-date policy.
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.getByRole("button", { name: "Add entry", exact: true }).click();
  await page.locator("select[name=project]").selectOption("p1");
  await page.getByLabel("What did you work on?").fill("Calendar context integration");
  await page.getByRole("button", {name:"Save entry",exact:true}).click();
  await page.getByLabel("Search calendar").fill("Calendar context integration");
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
  const date=`${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
  const target=page.locator(`[data-date="${date}"]`);
  await page.locator(".work-entry").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy", exact: true }).click();
  await target.click({button:"right",position:{x:10,y:60}});
  await page.getByRole("menuitem", { name: "Paste", exact: true }).click();
  await expect(page.getByRole("heading", {name:"Paste this entry?"})).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator(".work-entry").first().dragTo(target);
  await expect(target.locator(".work-entry")).toHaveCount(1);
  await expect(page.getByRole("heading",{name:"Move this entry?"})).toHaveCount(0);
  await target.locator(".work-entry").click({button:"right"});
  await page.getByRole("menuitem", {name:"Repeat through date"}).click();
  await expect(page.getByRole("heading",{name:"Repeat work across dates?"})).toBeVisible();
  await page.getByRole("button", {name:"Cancel",exact:true}).click();
  await page.getByLabel("Search calendar").fill("");
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.screenshot({
    path: "review/enhancements/calendar-month.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Editing access", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Calendar editing access" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("http://127.0.0.1:5173/preview/profile");
  await page
    .getByRole("button", { name: "Add experience", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Experience 2", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add education", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Education 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Item 1", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:5173/preview/people");
  await page.locator(".person-card").first().click();
  await expect(page.locator(".expanded-person")).toBeVisible();
  await page.screenshot({
    path: "review/enhancements/profile-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Profile overflows on mobile");
  await page.goto("http://127.0.0.1:5173/preview/calendar");
  await expect(page.locator(".work-calendar")).toBeVisible();
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Calendar page overflows on mobile");
  await page.screenshot({
    path: "review/enhancements/calendar-mobile.png",
    fullPage: true,
  });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Enhancement browser checks passed: filters, avatar swap, themes, 6 document downloads, all calendar views, editable hours, leave fields, context menu, drag/drop, repeat confirmation, access panel, profile editing and mobile overflow.",
  );
} finally {
  await browser.close();
}
