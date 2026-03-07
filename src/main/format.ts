import type { EntryRecord } from "./types";

interface MarkdownOptions {
  resolveScreenshotPath?: (inputPath: string) => string;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function toMarkdownPath(inputPath: string): string {
  return inputPath.replaceAll("\\", "/").replaceAll(" ", "%20");
}

export function formatLocalDay(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatLocalTime(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatFileTimestamp(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return `${formatLocalDay(date)}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function startOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

export function startOfWeek(now: Date = new Date()): Date {
  const today = startOfToday(now);
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  today.setDate(today.getDate() + diff);
  return today;
}

function escapeCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function entriesToMarkdown(day: string, entries: EntryRecord[], options: MarkdownOptions = {}): string {
  const lines = [`# ${day}`, ""];

  if (entries.length === 0) {
    lines.push("Nenhum registro respondido neste dia.");
    return lines.join("\n");
  }

  for (const entry of entries) {
    const label = formatLocalTime(entry.answeredAt ?? entry.createdAt);
    lines.push(`- ${label} - ${entry.text ?? ""}`);

    if (entry.screenshotPath) {
      const resolved = options.resolveScreenshotPath
        ? options.resolveScreenshotPath(entry.screenshotPath)
        : entry.screenshotPath;
      lines.push(`  ![Screenshot ${label}](${toMarkdownPath(resolved)})`);
    }
  }

  return lines.join("\n");
}

export function entriesToCsv(entries: EntryRecord[]): string {
  const header = [
    "id",
    "scheduled_at",
    "captured_at",
    "answered_at",
    "status",
    "text",
    "tag",
    "screenshot_path"
  ].join(",");

  const rows = entries.map((entry) => [
    escapeCsv(entry.id),
    escapeCsv(entry.scheduledAt),
    escapeCsv(entry.capturedAt ?? ""),
    escapeCsv(entry.answeredAt ?? ""),
    escapeCsv(entry.status),
    escapeCsv(entry.text ?? ""),
    escapeCsv(entry.tag ?? ""),
    escapeCsv(entry.screenshotPath ?? "")
  ].join(","));

  return [header, ...rows].join("\n");
}
