import test from "node:test";
import assert from "node:assert/strict";
import {
  timesheetAllowsEdits,
  timesheetAllowsSubmit,
} from "../src/lib/timesheet.ts";

test("work entries can be edited only while the timesheet is a draft or rejected", () => {
  assert.equal(timesheetAllowsEdits("draft"), true);
  assert.equal(timesheetAllowsEdits("rejected"), true);
  assert.equal(timesheetAllowsEdits(null), true);
  assert.equal(timesheetAllowsEdits("submitted"), false);
  assert.equal(timesheetAllowsEdits("approved"), false);
});

test("submit is allowed only for draft or rejected weeks that have entries", () => {
  assert.equal(timesheetAllowsSubmit("draft", true), true);
  assert.equal(timesheetAllowsSubmit("rejected", true), true);
  assert.equal(timesheetAllowsSubmit("draft", false), false);
  assert.equal(timesheetAllowsSubmit("submitted", true), false);
  assert.equal(timesheetAllowsSubmit("approved", true), false);
});
