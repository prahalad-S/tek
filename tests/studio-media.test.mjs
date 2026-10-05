import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/studioMedia.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { recordingMime, recordingName, elapsedLabel, stopStream } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("recording negotiates supported codecs and lets the browser choose if none match", () => {
  assert.equal(recordingMime(type => type === "video/mp4"), "video/mp4");
  assert.equal(recordingMime(type => type.includes("vp8")), "video/webm;codecs=vp8,opus");
  assert.equal(recordingMime(() => false), undefined);
});
test("download extension matches the actual recorder format and filename works on Windows", () => {
  const date = new Date("2026-10-05T09:15:30.123Z");
  assert.equal(recordingName("video/mp4;codecs=avc1", date), "tekzenit-screen-2026-10-05T09-15-30Z.mp4");
  assert.equal(recordingName("video/webm;codecs=vp9,opus", date), "tekzenit-screen-2026-10-05T09-15-30Z.webm");
});
test("elapsed recording time handles pause-compatible accumulated durations and hours", () => {
  assert.equal(elapsedLabel(0), "00:00");
  assert.equal(elapsedLabel(61500), "01:01");
  assert.equal(elapsedLabel(3661000), "01:01:01");
  assert.equal(elapsedLabel(-1000), "00:00");
});
test("cleanup releases every microphone, display, and mixed-audio track", () => {
  const stopped = [];
  stopStream({ getTracks: () => ["video", "screen audio", "microphone"].map(name => ({ stop: () => stopped.push(name) })) });
  assert.deepEqual(stopped, ["video", "screen audio", "microphone"]);
  assert.doesNotThrow(() => stopStream(null));
});
