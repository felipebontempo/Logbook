import type { AppSettings } from "./types";

type Timer = ReturnType<typeof setTimeout>;

export class ReminderScheduler {
  private nextRegularAt: number | null = null;
  private nextExtraAt: number | null = null;
  private timer: Timer | null = null;
  private settings: AppSettings | null = null;

  constructor(private readonly onReminderDue: (scheduledAt: string) => Promise<void>) {}

  start(settings: AppSettings): void {
    this.settings = settings;
    this.nextRegularAt = Date.now() + settings.checkinIntervalMinutes * 60_000;
    this.nextExtraAt = null;
    this.rearmTimer();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.nextRegularAt = null;
    this.nextExtraAt = null;
  }

  updateSettings(settings: AppSettings): void {
    this.settings = settings;
    if (this.nextRegularAt === null) {
      this.nextRegularAt = Date.now() + settings.checkinIntervalMinutes * 60_000;
    }
    this.rearmTimer();
  }

  scheduleExtra(minutesFromNow: number): void {
    const dueAt = Date.now() + minutesFromNow * 60_000;
    this.nextExtraAt = this.nextExtraAt === null ? dueAt : Math.min(this.nextExtraAt, dueAt);
    this.rearmTimer();
  }

  triggerNow(): void {
    this.nextExtraAt = Date.now();
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
    const extraDue = this.nextExtraAt !== null && this.nextExtraAt <= now;

    if (!regularDue && !extraDue) {
      this.rearmTimer();
      return;
    }

    const scheduledAt = new Date(extraDue && this.nextExtraAt !== null ? this.nextExtraAt : this.nextRegularAt ?? now).toISOString();

    if (regularDue) {
      this.nextRegularAt = now + this.settings.checkinIntervalMinutes * 60_000;
    }

    if (extraDue) {
      this.nextExtraAt = null;
    }

    this.rearmTimer();
    await this.onReminderDue(scheduledAt);
  }

  private getNextDueAt(): number | null {
    if (this.nextRegularAt === null) {
      return this.nextExtraAt;
    }

    if (this.nextExtraAt === null) {
      return this.nextRegularAt;
    }

    return Math.min(this.nextRegularAt, this.nextExtraAt);
  }
}