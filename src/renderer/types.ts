export interface SettingsPayload {
  dataDir: string;
  checkinIntervalMinutes: number;
  snoozeMinutes: number;
  popupTimeoutSeconds: number;
  launchAtLogin: boolean;
  needsSetup: boolean;
  screenRecordingHint: string | null;
}

export interface EntryListFilter {
  period: "today" | "week" | "all";
  search: string;
}

export interface EntryListItem {
  id: string;
  scheduledAt: string;
  capturedAt: string | null;
  answeredAt: string | null;
  text: string | null;
  tag: string | null;
  status: "answered" | "snoozed" | "skipped_fullscreen";
  screenshotPath: string | null;
  createdAt: string;
  updatedAt: string;
  localDay: string;
  localTime: string;
}

export interface EntryListResponse {
  items: EntryListItem[];
}

export interface ExportRequest {
  format: "csv" | "markdown";
  filter: EntryListFilter;
}

export interface PendingCheckinState {
  scheduledAt: string;
  capturedAt: string | null;
  screenshotTempPath: string | null;
  autoCloseAt: string;
}

export interface SaveSettingsRequest {
  dataDir: string;
  checkinIntervalMinutes: number;
  snoozeMinutes: number;
  popupTimeoutSeconds: number;
  launchAtLogin: boolean;
}