import type { EntryListFilter, EntryListResponse, ExportRequest, PendingCheckinState, SaveSettingsRequest, SettingsPayload } from "./types";

declare global {
  interface Window {
    logbook: {
      settings: {
        get(): Promise<SettingsPayload>;
        save(payload: SaveSettingsRequest): Promise<SettingsPayload>;
      };
      entries: {
        list(filter: EntryListFilter): Promise<EntryListResponse>;
        create(payload: { text: string }): Promise<unknown>;
        export(payload: ExportRequest): Promise<{ path: string }>;
      };
      checkin: {
        snooze(): Promise<{ ok: true }>;
        triggerNow(): Promise<{ ok: true }>;
        getState(): Promise<PendingCheckinState | null>;
      };
      app: {
        selectDataDirectory(): Promise<string | null>;
        showInFolder(targetPath: string): Promise<{ ok: true }>;
      };
      events: {
        onEntriesUpdated(callback: () => void): () => void;
        onSettingsUpdated(callback: () => void): () => void;
        onPopupUpdated(callback: () => void): () => void;
      };
    };
  }
}

export {};
