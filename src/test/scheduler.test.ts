import test from "node:test";
import assert from "node:assert/strict";
import { ReminderScheduler, type ReminderDueReason } from "../main/scheduler";
import type { AppSettings } from "../main/types";

const settings: AppSettings = {
  dataDir: "C:/Logbook",
  checkinIntervalMinutes: 5,
  snoozeMinutes: 5,
  popupTimeoutSeconds: 120,
  launchAtLogin: true
};

test("scheduleExtra suppresses an earlier regular reminder until the snooze window ends", (t) => {
  t.mock.timers.enable({
    apis: ["Date", "setTimeout"],
    now: new Date("2026-03-21T10:00:00.000Z")
  });

  const dueAt: string[] = [];
  const scheduler = new ReminderScheduler(async (scheduledAt) => {
    dueAt.push(scheduledAt);
  });

  try {
    scheduler.start(settings);
    t.mock.timers.tick(4 * 60_000);
    scheduler.scheduleExtra(5);

    t.mock.timers.tick(60_000);
    assert.equal(dueAt.length, 0);

    t.mock.timers.tick(4 * 60_000);
    assert.deepEqual(dueAt, ["2026-03-21T10:09:00.000Z"]);
  } finally {
    scheduler.stop();
  }
});

test("manual check-in resets the regular cadence and clears a pending snooze", (t) => {
  t.mock.timers.enable({
    apis: ["Date", "setTimeout"],
    now: new Date("2026-03-21T10:00:00.000Z")
  });

  const due: Array<{ at: string; reason: ReminderDueReason }> = [];
  const scheduler = new ReminderScheduler(async (scheduledAt, reason) => {
    due.push({ at: scheduledAt, reason });
  });

  try {
    scheduler.start(settings);
    t.mock.timers.tick(60_000);
    scheduler.scheduleExtra(10);

    t.mock.timers.tick(60_000);
    scheduler.triggerNow();
    t.mock.timers.tick(0);
    assert.deepEqual(due, [{ at: "2026-03-21T10:02:00.000Z", reason: "manual" }]);

    scheduler.resetRegularFromNow();

    t.mock.timers.tick(3 * 60_000);
    assert.equal(due.length, 1);

    t.mock.timers.tick(2 * 60_000);
    assert.deepEqual(due, [
      { at: "2026-03-21T10:02:00.000Z", reason: "manual" },
      { at: "2026-03-21T10:07:00.000Z", reason: "regular" }
    ]);
  } finally {
    scheduler.stop();
  }
});
