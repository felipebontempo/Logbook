import { cp, mkdir } from "node:fs/promises";

const targets = [
  ["../src/renderer/index.html", "../dist/renderer/index.html"],
  ["../src/renderer/popup.html", "../dist/renderer/popup.html"],
  ["../src/renderer/styles.css", "../dist/renderer/styles.css"],
  ["../src/renderer/popup.css", "../dist/renderer/popup.css"],
  ["../src/assets/tray.png", "../dist/assets/tray.png"]
];

for (const [from, to] of targets) {
  const destination = new URL(to, import.meta.url);
  await mkdir(new URL(".", destination), { recursive: true });
  await cp(new URL(from, import.meta.url), destination);
}
