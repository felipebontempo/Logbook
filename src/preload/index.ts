import { contextBridge, ipcRenderer } from "electron";
import type { EntryListFilter, ExportRequest, SaveEntryRequest, SaveSettingsRequest } from "../main/types";

contextBridge.exposeInMainWorld("logbook", {
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    save: (payload: SaveSettingsRequest) => ipcRenderer.invoke("settings:save", payload)
  },
  entries: {
    list: (filter: EntryListFilter) => ipcRenderer.invoke("entries:list", filter),
    create: (payload: SaveEntryRequest) => ipcRenderer.invoke("entries:create", payload),
    export: (payload: ExportRequest) => ipcRenderer.invoke("entries:export", payload)
  },
  checkin: {
    snooze: () => ipcRenderer.invoke("checkin:snooze"),
    triggerNow: () => ipcRenderer.invoke("checkin:triggerNow"),
    getState: () => ipcRenderer.invoke("popup:getState")
  },
  app: {
    selectDataDirectory: () => ipcRenderer.invoke("app:selectDataDirectory"),
    showInFolder: (targetPath: string) => ipcRenderer.invoke("app:showInFolder", targetPath)
  },
  events: {
    onEntriesUpdated: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("entries:updated", listener);
      return () => ipcRenderer.removeListener("entries:updated", listener);
    },
    onSettingsUpdated: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("settings:updated", listener);
      return () => ipcRenderer.removeListener("settings:updated", listener);
    },
    onPopupUpdated: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("popup:updated", listener);
      return () => ipcRenderer.removeListener("popup:updated", listener);
    }
  }
});
