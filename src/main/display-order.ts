export interface BoundsLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

function sortDisplaysByPosition<T extends BoundsLike>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    if (left.x !== right.x) {
      return left.x - right.x;
    }

    return left.y - right.y;
  });
}

export function resolveSourceOrderIndex(
  displays: ReadonlyArray<{ id: number; bounds: BoundsLike }>,
  targetDisplayId: number
): number {
  return sortDisplaysByPosition(displays.map((display) => ({
    id: display.id,
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height
  }))).findIndex((display) => display.id === targetDisplayId);
}
