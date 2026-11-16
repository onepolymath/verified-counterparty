import type { AuditEntry, AuditSink } from "@verified-counterparty/core/audit";

const KEY = "vc.audit.v1";

/** Browser sink for the demo: the buyer agent's audit log lives in this tab's localStorage. */
export class LocalStorageAuditSink implements AuditSink {
  append(entry: AuditEntry): Promise<void> {
    const all = this.read();
    all.push(entry);
    localStorage.setItem(KEY, JSON.stringify(all));
    return Promise.resolve();
  }

  readAll(): Promise<readonly AuditEntry[]> {
    return Promise.resolve(this.read());
  }

  /** Demo only: rewrite history to show that verifyChain catches it. */
  tamper(seq: number): void {
    const all = this.read().map((e) =>
      e.seq === seq
        ? { ...e, data: { ...e.data, verdict: "ALLOW", summary: "ALLOW: (edited after the fact)" } }
        : e,
    );
    localStorage.setItem(KEY, JSON.stringify(all));
  }

  clear(): void {
    localStorage.removeItem(KEY);
  }

  private read(): AuditEntry[] {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "[]") as AuditEntry[];
    } catch {
      return [];
    }
  }
}
