import test from "node:test";
import assert from "node:assert/strict";
import { entriesToCsv, entriesToMarkdown, formatLocalDay, formatLocalTime } from "../main/format";
import type { EntryRecord } from "../main/types";

const sample: EntryRecord = {
  id: "entry-1",
  scheduledAt: "2026-03-07T12:00:00.000Z",
  capturedAt: "2026-03-07T12:00:05.000Z",
  answeredAt: "2026-03-07T12:02:00.000Z",
  text: "Writing implementation notes",
  tag: null,
  status: "answered",
  screenshotPath: "C:/JourneyLog/days/2026-03-07/screenshots/2026-03-07_09-00-00.png",
  createdAt: "2026-03-07T12:02:00.000Z",
  updatedAt: "2026-03-07T12:02:00.000Z"
};

test("entriesToMarkdown renders a readable daily digest", () => {
  const markdown = entriesToMarkdown("2026-03-07", [sample]);
  assert.match(markdown, /# 2026-03-07/);
  assert.match(markdown, /Writing implementation notes/);
  assert.match(markdown, /!\[Screenshot/);
});

test("entriesToCsv escapes fields and includes headers", () => {
  const csv = entriesToCsv([{ ...sample, text: 'Focus on "analysis"' }]);
  assert.match(csv, /^id,scheduled_at,/);
  assert.match(csv, /"Focus on ""analysis"""/);
});

test("date format helpers return local friendly shapes", () => {
  const date = new Date("2026-03-07T09:45:00");
  assert.equal(formatLocalDay(date), "2026-03-07");
  assert.equal(formatLocalTime(date), "09:45");
});
