import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface BootstrapConfig {
  dataDir: string | null;
}

export class BootstrapStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<BootstrapConfig> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as BootstrapConfig;
      return { dataDir: parsed.dataDir ?? null };
    } catch {
      return { dataDir: null };
    }
  }

  async save(config: BootstrapConfig): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(config, null, 2), "utf8");
  }
}