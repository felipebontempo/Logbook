# JourneyLog Desktop

JourneyLog is a private desktop tracker for Windows and macOS. It runs in the tray/menu bar, opens a lightweight check-in popup on a configurable interval, captures a screenshot at popup open, stores answered entries in SQLite, and mirrors each day into a folder with `entries.md` plus screenshots.

## Stack

- Electron
- TypeScript
- Built-in `node:sqlite`
- Vanilla renderer UI

## Features in this MVP

- First-run setup for base data directory and interval
- Background scheduler with tray/menu bar presence
- Popup with `Enter` to save and `Esc` / button to snooze
- Auto-snooze after timeout
- Best-effort fullscreen detection before interrupting
- SQLite storage in the chosen data directory
- Daily folder mirror under `days/YYYY-MM-DD/`
- Analysis screen with filters for today, week, and free text
- CSV and Markdown export into `exports/`

## Local commands

```bash
npm install
npm run build
npm start
npm test
```

## Data layout

After setup, JourneyLog writes into your chosen base directory using this structure:

```text
journeylog.db
days/
  YYYY-MM-DD/
    entries.md
    screenshots/
exports/
.temp/
```

## Notes

- On macOS, screenshots depend on Screen Recording permission.
- Fullscreen detection is best effort and intentionally prefers deferring instead of interrupting.
- `node:sqlite` is currently an experimental Node API, but it avoids native SQLite dependencies for this MVP.
- Changing the data directory from settings points the app at a new storage root.

## Packaging

The project includes `electron-builder` configuration in `package.json` for Windows and macOS targets.