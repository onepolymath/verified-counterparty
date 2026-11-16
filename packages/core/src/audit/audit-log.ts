import { canonicalJson, sha256Hex } from "../util/crypto.js";

export const GENESIS_HASH = "0".repeat(64);

export type AuditEventType =
  "payment.decision" | "payment.settled" | "payment.failed" | "seller.gate";

export interface AuditEntry<T = Record<string, unknown>> {
  readonly seq: number;
  readonly ts: string;
  readonly type: AuditEventType;
  /** The acting agent (our own badge or a local id). EU AI Act Art. 12 "who". */
  readonly actor: string;
  readonly data: T;
  readonly prevHash: string;
  readonly hash: string;
}

export interface AuditSink {
  append(entry: AuditEntry): Promise<void>;
  readAll(): Promise<readonly AuditEntry[]>;
}

export class MemoryAuditSink implements AuditSink {
  private readonly entries: AuditEntry[] = [];
  append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
  readAll(): Promise<readonly AuditEntry[]> {
    return Promise.resolve([...this.entries]);
  }
}

async function entryHash(e: Omit<AuditEntry, "hash">): Promise<string> {
  return sha256Hex(
    canonicalJson({
      seq: e.seq,
      ts: e.ts,
      type: e.type,
      actor: e.actor,
      data: e.data,
      prevHash: e.prevHash,
    }),
  );
}

/**
 * Append-only, hash-chained audit log. Each entry commits to the previous one, so
 * deleting, reordering or editing any record is detectable by `verifyChain`.
 * Designed to support EU AI Act Art. 12 record-keeping for agent payment decisions.
 */
export class AuditLog {
  private head: { seq: number; hash: string } | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly sink: AuditSink,
    private readonly actor: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Appends are serialised so concurrent payments can never fork the chain. */
  append<T extends Record<string, unknown>>(type: AuditEventType, data: T): Promise<AuditEntry<T>> {
    const next = this.queue.then(() => this.doAppend(type, data));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async doAppend<T extends Record<string, unknown>>(
    type: AuditEventType,
    data: T,
  ): Promise<AuditEntry<T>> {
    if (this.head === null) {
      const existing = await this.sink.readAll();
      const last = existing.at(-1);
      this.head = last ? { seq: last.seq, hash: last.hash } : { seq: 0, hash: GENESIS_HASH };
    }
    const base = {
      seq: this.head.seq + 1,
      ts: this.clock().toISOString(),
      type,
      actor: this.actor,
      data: JSON.parse(JSON.stringify(data, bigintReplacer)) as T,
      prevHash: this.head.hash,
    };
    const entry: AuditEntry<T> = { ...base, hash: await entryHash(base) };
    await this.sink.append(entry);
    this.head = { seq: entry.seq, hash: entry.hash };
    return entry;
  }

  entries(): Promise<readonly AuditEntry[]> {
    return this.sink.readAll();
  }
}

export type ChainVerification =
  | { readonly ok: true; readonly length: number; readonly head: string }
  | { readonly ok: false; readonly brokenAt: number; readonly reason: string };

export async function verifyChain(entries: readonly AuditEntry[]): Promise<ChainVerification> {
  let prev = GENESIS_HASH;
  for (const [i, e] of entries.entries()) {
    if (e.seq !== i + 1)
      return { ok: false, brokenAt: i + 1, reason: `expected seq ${i + 1}, got ${e.seq}` };
    if (e.prevHash !== prev)
      return { ok: false, brokenAt: e.seq, reason: "prevHash does not link to previous entry" };
    const expected = await entryHash(e);
    if (expected !== e.hash)
      return { ok: false, brokenAt: e.seq, reason: "entry content was modified" };
    prev = e.hash;
  }
  return { ok: true, length: entries.length, head: prev };
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
