import test from "node:test";
import assert from "node:assert/strict";
import { resolveSourceOrderIndex } from "../main/display-order";

test("resolveSourceOrderIndex follows monitor position order for fallback matching", () => {
  const displays = [
    {
      id: 30,
      bounds: { x: 1440, y: 0, width: 2560, height: 1440 }
    },
    {
      id: 10,
      bounds: { x: -1920, y: 0, width: 1920, height: 1080 }
    },
    {
      id: 20,
      bounds: { x: 0, y: 0, width: 1440, height: 900 }
    }
  ];

  assert.equal(resolveSourceOrderIndex(displays, 10), 0);
  assert.equal(resolveSourceOrderIndex(displays, 20), 1);
  assert.equal(resolveSourceOrderIndex(displays, 30), 2);
});

test("resolveSourceOrderIndex returns -1 when the target display is missing", () => {
  const displays = [
    {
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 }
    }
  ];

  assert.equal(resolveSourceOrderIndex(displays, 99), -1);
});
