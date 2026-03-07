import type { PendingCheckinState } from "./types";

const input = document.querySelector<HTMLTextAreaElement>("#popup-input")!;
const meta = document.querySelector<HTMLElement>("#popup-meta")!;
const status = document.querySelector<HTMLElement>("#popup-status")!;
const saveButton = document.querySelector<HTMLButtonElement>("#popup-save")!;
const snoozeButton = document.querySelector<HTMLButtonElement>("#popup-snooze")!;

function setBusy(value: boolean): void {
  saveButton.disabled = value;
  snoozeButton.disabled = value;
}

function renderState(state: PendingCheckinState | null): void {
  if (!state) {
    meta.textContent = "No active reminder.";
    input.value = "";
    setBusy(false);
    return;
  }

  const scheduled = new Date(state.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const timeout = new Date(state.autoCloseAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  meta.textContent = `Scheduled for ${scheduled}. Auto-snooze at ${timeout}.`;
  status.textContent = state.capturedAt ? "Screenshot captured for this reminder." : "Reminder opened without screenshot.";
  setBusy(false);
}

async function loadState(): Promise<void> {
  const state = await window.journeylog.checkin.getState();
  renderState(state);
  window.setTimeout(() => input.focus(), 20);
}

async function save(): Promise<void> {
  const text = input.value.trim();
  if (!text) {
    status.textContent = "Type something before saving.";
    return;
  }

  setBusy(true);
  status.textContent = "Saving...";
  await window.journeylog.entries.create({ text });
  status.textContent = "Saved.";
}

async function snooze(): Promise<void> {
  setBusy(true);
  status.textContent = "Snoozing...";
  await window.journeylog.checkin.snooze();
  status.textContent = "Snoozed.";
}

saveButton.addEventListener("click", () => {
  void save();
});

snoozeButton.addEventListener("click", () => {
  void snooze();
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void save();
  }

  if (event.key === "Escape") {
    event.preventDefault();
    void snooze();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    void snooze();
  }
});

window.journeylog.events.onPopupUpdated(() => {
  void loadState();
});

void loadState();