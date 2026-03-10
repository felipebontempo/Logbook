# Logbook Desktop

Logbook is a private desktop tracker for Windows and macOS. It runs in the tray/menu bar, opens a lightweight check-in popup on a configurable interval, captures a screenshot at popup open, stores answered entries in SQLite, and mirrors each day into a folder with `entries.md` plus screenshots.

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

After setup, Logbook writes into your chosen base directory using this structure:

```text
logbook.db
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

### macOS Apple Silicon (M1/M2/M3)

For Apple Silicon, generate the installer from a native `arm64` terminal session. If you build from a Rosetta shell, Electron Builder can default to `x64`, which is what happened in this workspace.

Check your shell and Node architecture first:

```bash
uname -m
node -p "process.arch"
```

Both commands should report `arm64`.

If they report `x86_64` / `x64`, open a native Apple Silicon terminal and use an `arm64` Node.js installation before packaging.

Build an Apple Silicon installer with:

```bash
npm install
npm run package:mac:arm64
```

This generates the macOS artifacts in `dist/`, including:

- `Logbook-<version>-arm64.dmg`
- `Logbook-<version>-arm64-mac.zip`

Useful variants:

```bash
npm run package:mac:dir:arm64
npm run package:mac:universal
```

- `package:mac:dir:arm64` creates the unpacked `.app` bundle for inspection.
- `package:mac:universal` creates a universal macOS build for both Intel and Apple Silicon.

### Signing and notarization

For local/internal use, the unsigned `.dmg` is enough.

For distribution outside your own machine, you should sign and notarize the app with an Apple Developer ID certificate, otherwise Gatekeeper will warn or block the app on another Mac.

### macOS build resources

To replace Electron defaults, add these files under `build/`:

- `icon.icns` for the app icon
- optional DMG background assets
