import { desktopCapturer, screen, type DesktopCapturerSource, type Display } from "electron";
import { resolveSourceOrderIndex, type BoundsLike } from "./display-order";

function getDisplayThumbnailSize(display: Display): Electron.Size {
  return {
    width: Math.max(Math.round(display.bounds.width), 1),
    height: Math.max(Math.round(display.bounds.height), 1)
  };
}

async function getActiveWindowBounds(): Promise<BoundsLike | null> {
  try {
    const activeWin = await import("active-win");
    const active = await activeWin.activeWindow({
      accessibilityPermission: false,
      screenRecordingPermission: false
    });

    return active?.bounds ?? null;
  } catch {
    return null;
  }
}

function fallbackSourceForDisplay(targetDisplay: Display, sources: readonly DesktopCapturerSource[]): DesktopCapturerSource | null {
  const displays = screen.getAllDisplays();
  if (displays.length !== sources.length) {
    return sources[0] ?? null;
  }

  const targetIndex = resolveSourceOrderIndex(displays, targetDisplay.id);
  if (targetIndex === -1) {
    return sources[0] ?? null;
  }

  return sources[targetIndex] ?? null;
}

export async function getTargetDisplay(): Promise<Display> {
  const activeBounds = await getActiveWindowBounds();
  if (activeBounds) {
    return screen.getDisplayMatching(activeBounds);
  }

  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

export async function captureCurrentDisplayScreenshot(): Promise<Buffer | null> {
  const display = await getTargetDisplay();
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: getDisplayThumbnailSize(display),
    fetchWindowIcons: false
  });

  const source = sources.find((candidate) => candidate.display_id === String(display.id))
    ?? fallbackSourceForDisplay(display, sources);
  if (!source) {
    return null;
  }

  return source.thumbnail.toPNG();
}

export async function isFullscreenAppActive(): Promise<boolean> {
  try {
    const active = await getActiveWindowBounds();

    if (!active) {
      return false;
    }

    const display = screen.getDisplayMatching(active);
    const bounds = display.bounds;
    const tolerance = 8;

    return Math.abs(active.x - bounds.x) <= tolerance
      && Math.abs(active.y - bounds.y) <= tolerance
      && active.width >= bounds.width - tolerance
      && active.height >= bounds.height - tolerance;
  } catch {
    return false;
  }
}
