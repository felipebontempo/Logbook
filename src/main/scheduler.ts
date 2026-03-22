import type { AppSettings } from "./types";

type Timer = ReturnType<typeof setTimeout>;
type ExtraReminderReason = "manual" | "deferred";
export type ReminderDueReason = "regular" | ExtraReminderReason;

interface PendingExtraReminder {
  dueAt: number;
  reason: ExtraReminderReason;
}

export class ReminderScheduler {
  private nextRegularAt: number | null = null;
  private nextExtra: PendingExtraReminder | null = null;
  private timer: Timer | null = null;
  private settings: AppSettings | null = null;

  constructor(private readonly onReminderDue: (scheduledAt: string, reason: ReminderDueReason) => Promise<void>) {}

  start(settings: AppSettings): void {
    this.settings = settings;
    this.nextRegularAt = Date.now() + settings.checkinIntervalMinutes * 60_000;
    this.nextExtra = null;
    this.rearmTimer();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.nextRegularAt = null;
    this.nextExtra = null;
  }

  updateSettings(settings: AppSettings): void {
    this.settings = settings;
    if (this.nextRegularAt === null) {
      this.nextRegularAt = Date.now() + settings.checkinIntervalMinutes * 60_000;
    }
    this.rearmTimer();
  }

  scheduleExtra(minutesFromNow: number, reason: ExtraReminderReason = "deferred"): void {
    const dueAt = Date.now() + minutesFromNow * 60_000;
    if (this.nextExtra === null || dueAt <= this.nextExtra.dueAt) {
      this.nextExtra = { dueAt, reason };
    }
    this.rearmTimer();
  }

  triggerNow(): void {
    this.nextExtra = {
      dueAt: Date.now(),
      reason: "manual"
    };
    this.rearmTimer();
  }

  resetRegularFromNow(): void {
    if (!this.settings) {
      return;
    }

    this.nextExtra = null;
    this.nextRegularAt = Date.now() + this.settings.checkinIntervalMinutes * 60_000;
    this.rearmTimer();
  }

  private rearmTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const next = this.getNextDueAt();
    if (next === null) {
      return;
    }

    const delay = Math.max(next - Date.now(), 0);
    this.timer = setTimeout(() => {
      void this.handleTimer();
    }, delay);
  }

  private async handleTimer(): Promise<void> {
    if (!this.settings) {
      return;
    }

    const now = Date.now();
    const regularDue = this.nextRegularAt !== null && this.nextRegularAt <= now;
    const extraDue = this.nextExtra !== null && this.nextExtra.dueAt <= now;

    if (!regularDue && !extraDue) {
      this.rearmTimer();
      return;
    }

    const scheduledAt = new Date(extraDue && this.nextExtra !== null ? this.nextExtra.dueAt : this.nextRegularAt ?? now).toISOString();
    const reason: ReminderDueReason = extraDue && this.nextExtra !== null ? this.nextExtra.reason : "regular";

    if (regularDue) {
      this.nextRegularAt = now + this.settings.checkinIntervalMinutes * 60_000;
    }

    if (extraDue) {
      this.nextExtra = null;
    }

    this.rearmTimer();
    await this.onReminderDue(scheduledAt, reason);
  }

  private getNextDueAt(): number | null {
    // Extra reminders are used for snooze/defer flows and should suppress the
    // regular cadence until they fire. Otherwise a pending regular reminder can
    // reopen the popup before the requested snooze window ends.
    if (this.nextExtra !== null) {
      return this.nextExtra.dueAt;
    }

    if (this.nextRegularAt === null) {
      return null;
    }

    return this.nextRegularAt;
  }
}
