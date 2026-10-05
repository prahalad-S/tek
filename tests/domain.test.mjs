import test from "node:test";
import assert from "node:assert/strict";
import {
  csvCell,
  parseMinutes,
  weekStart,
  weekDays,
  minutesLabel,
} from "../src/lib/domain.ts";
test("weeks start on Monday, including Sunday and year boundaries", () => {
  assert.equal(weekStart(new Date("2026-09-27T12:00:00")), "2026-09-21");
  assert.equal(weekStart(new Date("2027-01-01T12:00:00")), "2026-12-28");
  assert.equal(weekDays("2026-12-28")[6], "2027-01-03");
});
test("duration calculations do not invent fractional minutes", () => {
  assert.equal(parseMinutes("1.25"), 75);
  assert.equal(minutesLabel(75), "1h 15m");
  for (const value of ["-1", "0", "abc", "25", "0.001"])
    assert.throws(() => parseMinutes(value));
});
test("spreadsheet exports escape quotes and neutralize formula prefixes", () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell("hello, world"), '"hello, world"');
  assert.equal(csvCell("@cmd"), '"\'@cmd"');
});
