import { desktopCapturer, screen } from "electron";

export async function captureCurrentDisplayScreenshot(): Promise<Buffer | null> {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.max(display.size.width, 1),
      height: Math.max(display.size.height, 1)
    },
    fetchWindowIcons: false
  });

  const source = sources.find((candidate) => candidate.display_id === String(display.id)) ?? sources[0];
  if (!source) {
    return null;
  }

  return source.thumbnail.toPNG();
}

export async function isFullscreenAppActive(): Promise<boolean> {
  try {
    const activeWin = await import("active-win");
    const active = await activeWin.activeWindow({
      accessibilityPermission: false,
      screenRecordingPermission: false
    });

    if (!active) {
      return false;
    }

    const center = {
      x: active.bounds.x + active.bounds.width / 2,
      y: active.bounds.y + active.bounds.height / 2
    };
    const display = screen.getDisplayNearestPoint(center);
    const bounds = display.bounds;
    const tolerance = 8;

    return Math.abs(active.bounds.x - bounds.x) <= tolerance
      && Math.abs(active.bounds.y - bounds.y) <= tolerance
      && active.bounds.width >= bounds.width - tolerance
      && active.bounds.height >= bounds.height - tolerance;
  } catch {
    return false;
  }
}