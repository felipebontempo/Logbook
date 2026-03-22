import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, shell } from "electron";
import path from "node:path";
import { existsSync } from "node:fs";
import { BootstrapStore } from "./bootstrap-store";
import { JourneyDatabase, toEntryListItem } from "./database";
import { captureCurrentDisplayScreenshot, getTargetDisplay, isFullscreenAppActive } from "./desktop";
import { ReminderScheduler, type ReminderDueReason } from "./scheduler";
import { DEFAULT_SETTINGS, type AppSettings, type EntryListFilter, type PendingCheckinState, type SaveEntryRequest, type SaveSettingsRequest, type SettingsPayload, type ExportRequest } from "./types";

interface ActiveCheckinInternal extends PendingCheckinState {
  reason: ReminderDueReason;
  timeout: ReturnType<typeof setTimeout>;
}

class LogbookApplication {
  private readonly bootstrapStore = new BootstrapStore(path.join(app.getPath("userData"), "bootstrap.json"));
  private readonly database = new JourneyDatabase();
  private readonly scheduler = new ReminderScheduler(async (scheduledAt, reason) => this.handleReminderDue(scheduledAt, reason));
  private mainWindow: BrowserWindow | null = null;
  private popupWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private activeCheckin: ActiveCheckinInternal | null = null;
  private isQuitting = false;

  async start(): Promise<void> {
    app.setAppUserModelId("com.felipe.logbook");
    app.setName("Logbook");

    await app.whenReady();
    await this.initializeStorage();
    this.registerIpc();
    this.createMainWindow();
    this.createTray();
    this.applyLaunchSettings();

    if (this.database.isReady()) {
      this.scheduler.start(this.database.getSettings());
      this.mainWindow?.hide();
    } else {
      this.showMainWindow();
    }

    app.on("activate", () => {
      this.showMainWindow();
    });

    app.on("before-quit", () => {
      this.isQuitting = true;
      this.scheduler.stop();
      this.clearActiveCheckinTimer();
    });

    app.on("window-all-closed", () => {
      // Keep the resident app alive in tray/menu bar mode.
    });
  }

  private async initializeStorage(): Promise<void> {
    const bootstrap = await this.bootstrapStore.load();
    if (bootstrap.dataDir) {
      await this.database.initialize(bootstrap.dataDir);
    }
  }

  private registerIpc(): void {
    ipcMain.handle("settings:get", async (): Promise<SettingsPayload> => this.getSettingsPayload());

    ipcMain.handle("app:selectDataDirectory", async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    });

    ipcMain.handle("settings:save", async (_event, payload: SaveSettingsRequest): Promise<SettingsPayload> => {
      await this.persistSettings(payload);
      return this.getSettingsPayload();
    });

    ipcMain.handle("entries:list", async (_event, filter: EntryListFilter) => {
      this.assertReady();
      return {
        items: this.database.listAnsweredEntries(filter).map(toEntryListItem)
      };
    });

    ipcMain.handle("entries:create", async (_event, payload: SaveEntryRequest) => {
      this.assertReady();
      if (!this.activeCheckin) {
        throw new Error("No active check-in to save.");
      }

      if (!payload.text.trim()) {
        throw new Error("Text is required.");
      }

      const checkin = this.activeCheckin;
      this.clearActiveCheckinTimer();
      const entry = await this.database.finalizeAnsweredEntry({
        scheduledAt: checkin.scheduledAt,
        capturedAt: checkin.capturedAt,
        tempScreenshotPath: checkin.screenshotTempPath,
        text: payload.text
      });

      if (checkin.reason === "manual") {
        this.scheduler.resetRegularFromNow();
      }

      this.activeCheckin = null;
      this.popupWindow?.hide();
      this.broadcast("entries:updated");
      return toEntryListItem(entry);
    });

    ipcMain.handle("checkin:snooze", async () => {
      await this.snoozeActiveCheckin();
      return { ok: true };
    });

    ipcMain.handle("popup:getState", async () => {
      return this.activeCheckin ? this.toPendingState(this.activeCheckin) : null;
    });

    ipcMain.handle("entries:export", async (_event, request: ExportRequest) => {
      this.assertReady();
      const exported = await this.database.exportEntries(request);
      this.broadcast("entries:updated");
      return exported;
    });

    ipcMain.handle("app:showInFolder", async (_event, targetPath: string) => {
      shell.showItemInFolder(targetPath);
      return { ok: true };
    });

    ipcMain.handle("checkin:triggerNow", async () => {
      this.scheduler.triggerNow();
      return { ok: true };
    });
  }

  private createMainWindow(): void {
    if (this.mainWindow) {
      return;
    }

    const isWindows = process.platform === "win32";

    this.mainWindow = new BrowserWindow({
      width: isWindows ? 1799 : 1180,
      height: isWindows ? 1250 : 860,
      minWidth: isWindows ? 1400 : 980,
      minHeight: isWindows ? 900 : 720,
      show: false,
      title: "Logbook",
      autoHideMenuBar: true,
      backgroundColor: "#f5f1e8",
      webPreferences: {
        preload: path.join(app.getAppPath(), "dist", "preload", "index.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    this.mainWindow.on("close", (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });

    void this.mainWindow.loadFile(path.join(app.getAppPath(), "dist", "renderer", "index.html"));
  }

  private createPopupWindow(): void {
    if (this.popupWindow) {
      return;
    }

    this.popupWindow = new BrowserWindow({
      width: 380,
      height: 340,
      frame: false,
      resizable: false,
      fullscreenable: false,
      show: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: "Logbook Check-in",
      backgroundColor: "#1d1208",
      webPreferences: {
        preload: path.join(app.getAppPath(), "dist", "preload", "index.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    this.popupWindow.on("close", (event) => {
      if (!this.isQuitting && this.activeCheckin) {
        event.preventDefault();
        void this.snoozeActiveCheckin();
      }
    });

    void this.popupWindow.loadFile(path.join(app.getAppPath(), "dist", "renderer", "popup.html"));
  }

  private createTray(): void {
    const icon = this.createTrayIcon();
    this.tray = new Tray(icon);
    this.tray.setToolTip("Logbook");
    this.tray.addListener("click", () => {
      this.showMainWindow();
    });
    this.refreshTrayMenu();
  }

  private refreshTrayMenu(): void {
    if (!this.tray) {
      return;
    }

    const menu = Menu.buildFromTemplate([
      {
        label: "Open Dashboard",
        click: () => this.showMainWindow()
      },
      {
        label: "Trigger Check-in Now",
        click: () => this.scheduler.triggerNow()
      },
      {
        type: "separator"
      },
      {
        label: "Quit",
        click: () => {
          this.isQuitting = true;
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(menu);
  }

  private createTrayIcon() {
    const pngPath = path.join(app.getAppPath(), "dist", "assets", "tray.png");

    if (existsSync(pngPath)) {
      const fromFile = nativeImage.createFromPath(pngPath);
      if (!fromFile.isEmpty()) {
        return fromFile.resize({
          width: process.platform === "win32" ? 16 : 18,
          height: process.platform === "win32" ? 16 : 18,
          quality: "best"
        });
      }
    }

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <rect x="2" y="2" width="60" height="60" rx="16" fill="#1f130c" />
        <circle cx="32" cy="32" r="18" fill="#fff8ef" />
        <circle cx="32" cy="32" r="2.5" fill="#2a1a10" />
        <path d="M32 32V21" stroke="#2a1a10" stroke-width="3.5" stroke-linecap="round" />
        <path d="M32 32L42 36" stroke="#b4512f" stroke-width="3.5" stroke-linecap="round" />
      </svg>
    `;

    const base = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
    const icon = base.resize({
      width: process.platform === "win32" ? 16 : 18,
      height: process.platform === "win32" ? 16 : 18,
      quality: "best"
    });

    return icon.isEmpty() ? base : icon;
  }

  private showMainWindow(): void {
    this.createMainWindow();
    this.mainWindow?.show();
    this.mainWindow?.focus();
  }

  private async persistSettings(payload: SaveSettingsRequest): Promise<void> {
    await this.database.initialize(payload.dataDir);
    this.database.saveSettings(payload);
    await this.bootstrapStore.save({ dataDir: payload.dataDir });
    this.applyLaunchSettings();
    this.scheduler.updateSettings(this.database.getSettings());
    if (!this.database.isReady()) {
      this.scheduler.start(this.database.getSettings());
    }
    if (!this.mainWindow) {
      this.createMainWindow();
    }
    this.broadcast("settings:updated");
    this.refreshTrayMenu();
  }

  private getSettingsPayload(): SettingsPayload {
    if (!this.database.isReady()) {
      return {
        dataDir: "",
        ...DEFAULT_SETTINGS,
        needsSetup: true,
        screenRecordingHint: process.platform === "darwin"
          ? "On macOS, grant Screen Recording permission so Logbook can capture screenshots."
          : null
      };
    }

    return {
      ...this.database.getSettings(),
      needsSetup: false,
      screenRecordingHint: process.platform === "darwin"
        ? "If screenshots are blank, grant Screen Recording permission in System Settings."
        : null
    };
  }

  private applyLaunchSettings(): void {
    if (!this.database.isReady()) {
      return;
    }

    const settings = this.database.getSettings();
    app.setLoginItemSettings({
      openAtLogin: settings.launchAtLogin,
      openAsHidden: true
    });
  }

  private async handleReminderDue(scheduledAt: string, reason: ReminderDueReason): Promise<void> {
    if (!this.database.isReady() || this.activeCheckin) {
      return;
    }

    const settings = this.database.getSettings();
    if (await isFullscreenAppActive()) {
      await this.database.recordStatusEvent({
        scheduledAt,
        capturedAt: null,
        status: "skipped_fullscreen",
        tempScreenshotPath: null
      });
      this.scheduler.scheduleExtra(10);
      return;
    }

    let capturedAt: string | null = null;
    let tempScreenshotPath: string | null = null;

    try {
      const screenshot = await captureCurrentDisplayScreenshot();
      if (screenshot) {
        capturedAt = new Date().toISOString();
        tempScreenshotPath = await this.database.savePendingScreenshot(screenshot, capturedAt);
      }
    } catch {
      capturedAt = null;
      tempScreenshotPath = null;
    }

    this.createPopupWindow();
    const timeout = setTimeout(() => {
      void this.snoozeActiveCheckin();
    }, settings.popupTimeoutSeconds * 1000);

    this.activeCheckin = {
      scheduledAt,
      capturedAt,
      screenshotTempPath: tempScreenshotPath,
      autoCloseAt: new Date(Date.now() + settings.popupTimeoutSeconds * 1000).toISOString(),
      reason,
      timeout
    };

    await this.positionPopupWindow();
    this.popupWindow?.show();
    this.popupWindow?.focus();
    this.popupWindow?.webContents.send("popup:updated");
  }

  private async positionPopupWindow(): Promise<void> {
    if (!this.popupWindow) {
      return;
    }

    const display = await getTargetDisplay();
    const bounds = this.popupWindow.getBounds();
    const x = Math.round(display.workArea.x + display.workArea.width - bounds.width - 24);
    const y = Math.round(display.workArea.y + display.workArea.height - bounds.height - 24);
    this.popupWindow.setPosition(x, y);
  }

  private async snoozeActiveCheckin(): Promise<void> {
    if (!this.activeCheckin || !this.database.isReady()) {
      this.popupWindow?.hide();
      return;
    }

    const checkin = this.activeCheckin;
    this.clearActiveCheckinTimer();
    await this.database.recordStatusEvent({
      scheduledAt: checkin.scheduledAt,
      capturedAt: checkin.capturedAt,
      status: "snoozed",
      tempScreenshotPath: checkin.screenshotTempPath
    });

    this.activeCheckin = null;
    this.popupWindow?.hide();
    this.scheduler.scheduleExtra(this.database.getSettings().snoozeMinutes);
    this.broadcast("entries:updated");
  }

  private clearActiveCheckinTimer(): void {
    if (this.activeCheckin) {
      clearTimeout(this.activeCheckin.timeout);
    }
  }

  private toPendingState(checkin: ActiveCheckinInternal): PendingCheckinState {
    return {
      scheduledAt: checkin.scheduledAt,
      capturedAt: checkin.capturedAt,
      screenshotTempPath: checkin.screenshotTempPath,
      autoCloseAt: checkin.autoCloseAt
    };
  }

  private assertReady(): void {
    if (!this.database.isReady()) {
      throw new Error("Logbook is not configured yet.");
    }
  }

  private broadcast(channel: "entries:updated" | "settings:updated"): void {
    this.mainWindow?.webContents.send(channel);
    this.popupWindow?.webContents.send(channel);
  }
}

const journeyLog = new LogbookApplication();
void journeyLog.start();
