export type EntryStatus = "answered" | "snoozed" | "skipped_fullscreen";

export interface AppSettings {
  dataDir: string;
  checkinIntervalMinutes: number;
  snoozeMinutes: number;
  popupTimeoutSeconds: number;
  launchAtLogin: boolean;
}

export interface SettingsPayload extends AppSettings {
  needsSetup: boolean;
  screenRecordingHint: string | null;
}

export interface EntryRecord {
  id: string;
  scheduledAt: string;
  capturedAt: string | null;
  answeredAt: string | null;
  text: string | null;
  tag: string | null;
  status: EntryStatus;
  screenshotPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntryListFilter {
  period: "today" | "week" | "all";
  search: string;
}

export interface PendingCheckinState {
  scheduledAt: string;
  capturedAt: string | null;
  screenshotTempPath: string | null;
  autoCloseAt: string;
}

export interface EntryListItem extends EntryRecord {
  localDay: string;
  localTime: string;
}

export interface EntryListResponse {
  items: EntryListItem[];
}

export interface SaveEntryRequest {
  text: string;
}

export interface SaveSettingsRequest {
  dataDir: string;
  checkinIntervalMinutes: number;
  snoozeMinutes: number;
  popupTimeoutSeconds: number;
  launchAtLogin: boolean;
}

export interface ExportRequest {
  format: "csv" | "markdown";
  filter: EntryListFilter;
}

export interface ExportResponse {
  path: string;
}

export const DEFAULT_SETTINGS: Omit<AppSettings, "dataDir"> = {
  checkinIntervalMinutes: 60,
  snoozeMinutes: 5,
  popupTimeoutSeconds: 120,
  launchAtLogin: true
};