import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AuditEntry, AuditSink } from "./audit-log.js";

/** Node-only sink: one JSON object per line, append-only. */
export class JsonlFileAuditSink implements AuditSink {
  constructor(private readonly path: string) {}

  async append(entry: AuditEntry): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, JSON.stringify(entry) + "\n", "utf8");
  }

  async readAll(): Promise<readonly AuditEntry[]> {
    try {
      const text = await readFile(this.path, "utf8");
      return text
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as AuditEntry);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }
}
