import { DatabaseSync } from "node:sqlite";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { entriesToCsv, entriesToMarkdown, formatFileTimestamp, formatLocalDay, formatLocalTime, startOfToday, startOfWeek } from "./format";
import { DEFAULT_SETTINGS, type AppSettings, type EntryListFilter, type EntryRecord, type EntryStatus, type ExportRequest, type ExportResponse, type SaveSettingsRequest } from "./types";

interface EntryRow {
  id: string;
  scheduled_at: string;
  captured_at: string | null;
  answered_at: string | null;
  text: string | null;
  tag: string | null;
  status: EntryStatus;
  screenshot_path: string | null;
  created_at: string;
  updated_at: string;
}

function toEntryRecord(row: EntryRow): EntryRecord {
  return {
    id: row.id,
    scheduledAt: row.scheduled_at,
    capturedAt: row.captured_at,
    answeredAt: row.answered_at,
    text: row.text,
    tag: row.tag,
    status: row.status,
    screenshotPath: row.screenshot_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class JourneyDatabase {
  private db: DatabaseSync | null = null;
  private dataDir: string | null = null;

  async initialize(dataDir: string): Promise<void> {
    await mkdir(dataDir, { recursive: true });
    await mkdir(path.join(dataDir, "days"), { recursive: true });
    await mkdir(path.join(dataDir, "exports"), { recursive: true });
    await mkdir(path.join(dataDir, ".temp"), { recursive: true });

    this.dataDir = dataDir;
    this.db = new DatabaseSync(path.join(dataDir, "journeylog.db"));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data_dir TEXT NOT NULL,
        checkin_interval_minutes INTEGER NOT NULL,
        snooze_minutes INTEGER NOT NULL,
        popup_timeout_seconds INTEGER NOT NULL,
        launch_at_login INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        scheduled_at TEXT NOT NULL,
        captured_at TEXT,
        answered_at TEXT,
        text TEXT,
        tag TEXT,
        status TEXT NOT NULL,
        screenshot_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entries_answered_at ON entries(answered_at);
      CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
    `);

    const existing = this.db.prepare("SELECT COUNT(*) AS count FROM settings").get() as { count: number };
    if (existing.count === 0) {
      this.saveSettings({
        dataDir,
        ...DEFAULT_SETTINGS
      });
    }
  }

  isReady(): boolean {
    return this.db !== null && this.dataDir !== null;
  }

  getDataDir(): string {
    if (!this.dataDir) {
      throw new Error("Database not initialized");
    }
    return this.dataDir;
  }

  getSettings(): AppSettings {
    const db = this.requireDb();
    const row = db.prepare(`SELECT data_dir, checkin_interval_minutes, snooze_minutes, popup_timeout_seconds, launch_at_login FROM settings WHERE id = 1`).get() as {
      data_dir: string;
      checkin_interval_minutes: number;
      snooze_minutes: number;
      popup_timeout_seconds: number;
      launch_at_login: number;
    } | undefined;

    if (!row) {
      throw new Error("Settings row missing");
    }

    return {
      dataDir: row.data_dir,
      checkinIntervalMinutes: row.checkin_interval_minutes,
      snoozeMinutes: row.snooze_minutes,
      popupTimeoutSeconds: row.popup_timeout_seconds,
      launchAtLogin: Boolean(row.launch_at_login)
    };
  }

  saveSettings(input: SaveSettingsRequest): AppSettings {
    const db = this.requireDb();
    db.prepare(`
      INSERT INTO settings (id, data_dir, checkin_interval_minutes, snooze_minutes, popup_timeout_seconds, launch_at_login)
      VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data_dir = excluded.data_dir,
        checkin_interval_minutes = excluded.checkin_interval_minutes,
        snooze_minutes = excluded.snooze_minutes,
        popup_timeout_seconds = excluded.popup_timeout_seconds,
        launch_at_login = excluded.launch_at_login
    `).run(
      input.dataDir,
      input.checkinIntervalMinutes,
      input.snoozeMinutes,
      input.popupTimeoutSeconds,
      input.launchAtLogin ? 1 : 0
    );

    this.dataDir = input.dataDir;
    return this.getSettings();
  }

  async savePendingScreenshot(buffer: Buffer, capturedAt: string): Promise<string> {
    const tempPath = path.join(this.getDataDir(), ".temp", `${formatFileTimestamp(capturedAt)}-${crypto.randomUUID()}.png`);
    await writeFile(tempPath, buffer);
    return tempPath;
  }

  async discardPendingScreenshot(tempPath: string | null): Promise<void> {
    if (!tempPath) {
      return;
    }
    await rm(tempPath, { force: true });
  }

  async finalizeAnsweredEntry(input: {
    scheduledAt: string;
    capturedAt: string | null;
    text: string;
    tempScreenshotPath: string | null;
  }): Promise<EntryRecord> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    let finalScreenshotPath: string | null = null;

    if (input.tempScreenshotPath && input.capturedAt) {
      finalScreenshotPath = await this.moveScreenshot(input.tempScreenshotPath, input.capturedAt);
    }

    this.requireDb().prepare(`
      INSERT INTO entries (id, scheduled_at, captured_at, answered_at, text, tag, status, screenshot_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, 'answered', ?, ?, ?)
    `).run(id, input.scheduledAt, input.capturedAt, now, input.text.trim(), finalScreenshotPath, now, now);

    const entry = this.getEntryById(id);
    await this.regenerateDayArtifacts(formatLocalDay(now));
    return entry;
  }

  async recordStatusEvent(input: {
    scheduledAt: string;
    capturedAt: string | null;
    status: Exclude<EntryStatus, "answered">;
    tempScreenshotPath: string | null;
  }): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.discardPendingScreenshot(input.tempScreenshotPath);
    this.requireDb().prepare(`
      INSERT INTO entries (id, scheduled_at, captured_at, answered_at, text, tag, status, screenshot_path, created_at, updated_at)
      VALUES (?, ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?)
    `).run(id, input.scheduledAt, input.capturedAt, input.status, now, now);
  }

  listAnsweredEntries(filter: EntryListFilter): EntryRecord[] {
    const db = this.requireDb();
    const clauses = ["status = 'answered'"];
    const params: Array<string | number | null> = [];
    const range = this.resolveRange(filter.period);

    if (range) {
      clauses.push("answered_at >= ?");
      params.push(range.toISOString());
    }

    if (filter.search.trim()) {
      clauses.push("LOWER(COALESCE(text, '')) LIKE ?");
      params.push(`%${filter.search.trim().toLowerCase()}%`);
    }

    const rows = db.prepare(`
      SELECT id, scheduled_at, captured_at, answered_at, text, tag, status, screenshot_path, created_at, updated_at
      FROM entries
      WHERE ${clauses.join(" AND ")}
      ORDER BY answered_at DESC, created_at DESC
    `).all(...params) as unknown as EntryRow[];

    return rows.map(toEntryRecord);
  }

  async exportEntries(request: ExportRequest): Promise<ExportResponse> {
    const entries = this.listAnsweredEntries(request.filter);
    const timestamp = formatFileTimestamp(new Date());
    const extension = request.format === "csv" ? "csv" : "md";
    const exportPath = path.join(this.getDataDir(), "exports", `journeylog-${timestamp}.${extension}`);

    if (request.format === "csv") {
      await writeFile(exportPath, entriesToCsv(entries), "utf8");
    } else {
      const markdown = this.entriesToMarkdownDocument(entries, path.dirname(exportPath));
      await writeFile(exportPath, markdown, "utf8");
    }

    return { path: exportPath };
  }

  private entriesToMarkdownDocument(entries: EntryRecord[], exportDirectory: string): string {
    const groups = new Map<string, EntryRecord[]>();
    for (const entry of entries) {
      const day = formatLocalDay(entry.answeredAt ?? entry.createdAt);
      const current = groups.get(day) ?? [];
      current.push(entry);
      groups.set(day, current);
    }

    if (groups.size === 0) {
      return "# JourneyLog Export\n\nNenhum registro encontrado.";
    }

    const chunks = ["# JourneyLog Export", ""];
    for (const day of [...groups.keys()].sort().reverse()) {
      chunks.push(entriesToMarkdown(day, groups.get(day) ?? [], {
        resolveScreenshotPath: (screenshotPath) => path.relative(exportDirectory, screenshotPath)
      }));
      chunks.push("");
    }

    return chunks.join("\n").trimEnd();
  }

  private async moveScreenshot(tempPath: string, capturedAt: string): Promise<string> {
    const day = formatLocalDay(capturedAt);
    const screenshotsDir = path.join(this.getDataDir(), "days", day, "screenshots");
    await mkdir(screenshotsDir, { recursive: true });
    const destination = path.join(screenshotsDir, `${formatFileTimestamp(capturedAt)}.png`);
    await rename(tempPath, destination);
    return destination;
  }

  async regenerateDayArtifacts(day: string): Promise<void> {
    const start = new Date(`${day}T00:00:00`);
    const end = new Date(`${day}T00:00:00`);
    end.setDate(end.getDate() + 1);

    const entries = this.requireDb().prepare(`
      SELECT id, scheduled_at, captured_at, answered_at, text, tag, status, screenshot_path, created_at, updated_at
      FROM entries
      WHERE status = 'answered' AND answered_at >= ? AND answered_at < ?
      ORDER BY answered_at ASC, created_at ASC
    `).all(start.toISOString(), end.toISOString()) as unknown as EntryRow[];

    const dayDir = path.join(this.getDataDir(), "days", day);
    await mkdir(dayDir, { recursive: true });
    await writeFile(path.join(dayDir, "entries.md"), entriesToMarkdown(day, entries.map(toEntryRecord)), "utf8");
  }

  private getEntryById(id: string): EntryRecord {
    const row = this.requireDb().prepare(`
      SELECT id, scheduled_at, captured_at, answered_at, text, tag, status, screenshot_path, created_at, updated_at
      FROM entries
      WHERE id = ?
    `).get(id) as EntryRow | undefined;

    if (!row) {
      throw new Error(`Entry not found: ${id}`);
    }

    return toEntryRecord(row);
  }

  private requireDb(): DatabaseSync {
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    return this.db;
  }

  private resolveRange(period: EntryListFilter["period"]): Date | null {
    if (period === "today") {
      return startOfToday();
    }

    if (period === "week") {
      return startOfWeek();
    }

    return null;
  }
}

export function toEntryListItem(entry: EntryRecord) {
  return {
    ...entry,
    localDay: formatLocalDay(entry.answeredAt ?? entry.createdAt),
    localTime: formatLocalTime(entry.answeredAt ?? entry.createdAt)
  };
}
