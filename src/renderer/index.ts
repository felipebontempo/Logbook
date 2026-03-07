import type { EntryListFilter, EntryListItem, SettingsPayload } from "./types";

const state: {
  settings: SettingsPayload | null;
  filter: EntryListFilter;
  items: EntryListItem[];
  selectedId: string | null;
} = {
  settings: null,
  filter: { period: "today", search: "" },
  items: [],
  selectedId: null
};

const setupView = document.querySelector<HTMLElement>("#setup-view")!;
const dashboardView = document.querySelector<HTMLElement>("#dashboard-view")!;
const statusText = document.querySelector<HTMLElement>("#status-text")!;
const setupHint = document.querySelector<HTMLElement>("#setup-hint")!;
const settingsHint = document.querySelector<HTMLElement>("#settings-hint")!;
const entriesList = document.querySelector<HTMLElement>("#entries-list")!;
const entryDetail = document.querySelector<HTMLElement>("#entry-detail")!;
const searchInput = document.querySelector<HTMLInputElement>("#search-input")!;

function input(id: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(id)!;
}

function setHint(target: HTMLElement, message: string, isError = false): void {
  target.textContent = message;
  target.style.color = isError ? "#9c2f18" : "";
}

function fileUrl(targetPath: string): string {
  const normalized = targetPath.replace(/\\/g, "/");
  return encodeURI(`file:///${normalized}`);
}

async function loadSettings(): Promise<void> {
  state.settings = await window.journeylog.settings.get();
  renderSettings();
}

async function loadEntries(): Promise<void> {
  if (!state.settings || state.settings.needsSetup) {
    state.items = [];
    state.selectedId = null;
    renderEntries();
    return;
  }

  const response = await window.journeylog.entries.list(state.filter);
  state.items = response.items;
  if (!state.items.find((entry) => entry.id === state.selectedId)) {
    state.selectedId = state.items[0]?.id ?? null;
  }
  renderEntries();
}

function renderSettings(): void {
  if (!state.settings) {
    return;
  }

  const settings = state.settings;
  statusText.textContent = settings.needsSetup
    ? "Waiting for first-run configuration."
    : `Tracking every ${settings.checkinIntervalMinutes} minutes into ${settings.dataDir}`;

  setupView.classList.toggle("hidden", !settings.needsSetup);
  dashboardView.classList.toggle("hidden", settings.needsSetup);

  input("#setup-data-dir").value = settings.dataDir;
  input("#setup-interval").value = String(settings.checkinIntervalMinutes);
  input("#setup-snooze").value = String(settings.snoozeMinutes);
  input("#setup-timeout").value = String(settings.popupTimeoutSeconds);
  input("#setup-launch").checked = settings.launchAtLogin;

  input("#settings-data-dir").value = settings.dataDir;
  input("#settings-interval").value = String(settings.checkinIntervalMinutes);
  input("#settings-snooze").value = String(settings.snoozeMinutes);
  input("#settings-timeout").value = String(settings.popupTimeoutSeconds);
  input("#settings-launch").checked = settings.launchAtLogin;

  setHint(setupHint, settings.screenRecordingHint ?? "");
  setHint(settingsHint, settings.screenRecordingHint ?? "");
}

function groupedEntries(): Map<string, EntryListItem[]> {
  const groups = new Map<string, EntryListItem[]>();
  for (const entry of state.items) {
    const current = groups.get(entry.localDay) ?? [];
    current.push(entry);
    groups.set(entry.localDay, current);
  }
  return groups;
}

function renderEntries(): void {
  if (state.items.length === 0) {
    entriesList.innerHTML = '<p class="empty-state">No answered entries for this filter.</p>';
    entryDetail.className = "entry-detail empty-state";
    entryDetail.textContent = state.settings?.needsSetup
      ? "Complete the setup to start seeing entries."
      : "No entries available for the current filter.";
    return;
  }

  const groups = groupedEntries();
  entriesList.innerHTML = "";

  for (const day of [...groups.keys()].sort().reverse()) {
    const wrapper = document.createElement("section");
    wrapper.className = "entry-group";

    const heading = document.createElement("h3");
    heading.textContent = day;
    wrapper.appendChild(heading);

    for (const entry of groups.get(day) ?? []) {
      const button = document.createElement("button");
      button.className = `entry-card${entry.id === state.selectedId ? " active" : ""}`;
      button.innerHTML = `<strong>${entry.localTime}</strong><span>${escapeHtml(entry.text ?? "")}</span>`;
      button.addEventListener("click", () => {
        state.selectedId = entry.id;
        renderEntries();
      });
      wrapper.appendChild(button);
    }

    entriesList.appendChild(wrapper);
  }

  renderDetail();
}

function renderDetail(): void {
  const selected = state.items.find((entry) => entry.id === state.selectedId);
  if (!selected) {
    entryDetail.className = "entry-detail empty-state";
    entryDetail.textContent = "Select an entry to inspect the detail.";
    return;
  }

  entryDetail.className = "entry-detail";
  entryDetail.innerHTML = `
    <p class="eyebrow">Entry detail</p>
    <h2>${selected.localDay}</h2>
    <div class="detail-meta">
      <span>${selected.localTime}</span>
      <span>Scheduled: ${new Date(selected.scheduledAt).toLocaleString()}</span>
      <span>Captured: ${selected.capturedAt ? new Date(selected.capturedAt).toLocaleString() : "No screenshot"}</span>
    </div>
    <p class="detail-text">${escapeHtml(selected.text ?? "")}</p>
  `;

  if (selected.screenshotPath) {
    const image = document.createElement("img");
    image.className = "detail-image";
    image.src = fileUrl(selected.screenshotPath);
    image.alt = "Screenshot attached to entry";
    entryDetail.appendChild(image);

    const button = document.createElement("button");
    button.className = "secondary link-button";
    button.textContent = "Show screenshot in folder";
    button.addEventListener("click", () => {
      void window.journeylog.app.showInFolder(selected.screenshotPath!);
    });
    entryDetail.appendChild(button);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("\n", "<br />");
}

function readSettingsForm(prefix: "setup" | "settings") {
  return {
    dataDir: input(`#${prefix}-data-dir`).value.trim(),
    checkinIntervalMinutes: Number(input(`#${prefix}-interval`).value),
    snoozeMinutes: Number(input(`#${prefix}-snooze`).value),
    popupTimeoutSeconds: Number(input(`#${prefix}-timeout`).value),
    launchAtLogin: input(`#${prefix}-launch`).checked
  };
}

async function saveSettings(prefix: "setup" | "settings"): Promise<void> {
  const hint = prefix === "setup" ? setupHint : settingsHint;
  const payload = readSettingsForm(prefix);

  if (!payload.dataDir) {
    setHint(hint, "Choose a base directory before saving.", true);
    return;
  }

  if (payload.checkinIntervalMinutes < 5 || payload.snoozeMinutes < 1 || payload.popupTimeoutSeconds < 15) {
    setHint(hint, "Use at least 5 min interval, 1 min snooze, and 15 sec timeout.", true);
    return;
  }

  setHint(hint, "Saving...");
  await window.journeylog.settings.save(payload);
  await loadSettings();
  await loadEntries();
  setHint(hint, "Saved.");
}

async function chooseDirectory(targetInputId: string): Promise<void> {
  const selected = await window.journeylog.app.selectDataDirectory();
  if (selected) {
    input(targetInputId).value = selected;
  }
}

async function exportEntries(format: "csv" | "markdown"): Promise<void> {
  const result = await window.journeylog.entries.export({ format, filter: state.filter });
  setHint(settingsHint, `Exported to ${result.path}`);
  await window.journeylog.app.showInFolder(result.path);
}

function attachEvents(): void {
  document.querySelector("#pick-data-dir")?.addEventListener("click", () => void chooseDirectory("#setup-data-dir"));
  document.querySelector("#change-data-dir")?.addEventListener("click", () => void chooseDirectory("#settings-data-dir"));
  document.querySelector("#save-setup")?.addEventListener("click", () => void saveSettings("setup"));
  document.querySelector("#save-settings")?.addEventListener("click", () => void saveSettings("settings"));
  document.querySelector("#trigger-now")?.addEventListener("click", () => void window.journeylog.checkin.triggerNow());
  document.querySelector("#export-csv")?.addEventListener("click", () => void exportEntries("csv"));
  document.querySelector("#export-md")?.addEventListener("click", () => void exportEntries("markdown"));

  searchInput.addEventListener("input", () => {
    state.filter.search = searchInput.value;
    void loadEntries();
  });

  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".period"))) {
    button.addEventListener("click", () => {
      for (const item of Array.from(document.querySelectorAll<HTMLButtonElement>(".period"))) {
        item.classList.toggle("active", item === button);
      }
      state.filter.period = button.dataset.period as EntryListFilter["period"];
      void loadEntries();
    });
  }

  window.journeylog.events.onEntriesUpdated(() => {
    void loadEntries();
  });

  window.journeylog.events.onSettingsUpdated(() => {
    void loadSettings();
  });
}

async function bootstrap(): Promise<void> {
  attachEvents();
  await loadSettings();
  await loadEntries();
}

void bootstrap();