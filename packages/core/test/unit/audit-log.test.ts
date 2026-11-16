import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AuditLog,
  GENESIS_HASH,
  MemoryAuditSink,
  verifyChain,
  type AuditEntry,
} from "../../src/audit/audit-log.js";
import { JsonlFileAuditSink } from "../../src/audit/jsonl-sink.js";
import { NOW } from "../helpers.js";

async function threeEntries() {
  const log = new AuditLog(new MemoryAuditSink(), "buyer", () => NOW);
  await log.append("payment.decision", { verdict: "ALLOW", amount: 10n });
  await log.append("payment.settled", { tx: "abc" });
  await log.append("payment.decision", { verdict: "DENY" });
  return { log, entries: [...(await log.entries())] };
}

describe("AuditLog", () => {
  it("builds a verifiable hash chain from genesis", async () => {
    const { entries } = await threeEntries();
    expect(entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(entries[0]?.prevHash).toBe(GENESIS_HASH);
    expect(entries[1]?.prevHash).toBe(entries[0]?.hash);
    expect(entries[0]?.data).toEqual({ verdict: "ALLOW", amount: "10" });
    expect(await verifyChain(entries)).toEqual({ ok: true, length: 3, head: entries[2]?.hash });
  });

  it("detects an edited entry", async () => {
    const { entries } = await threeEntries();
    const tampered = entries.map((e, i) => (i === 1 ? { ...e, data: { tx: "evil" } } : e));
    expect(await verifyChain(tampered)).toEqual({
      ok: false,
      brokenAt: 2,
      reason: "entry content was modified",
    });
  });

  it("detects a deleted entry", async () => {
    const { entries } = await threeEntries();
    expect(await verifyChain([entries[0], entries[2]] as AuditEntry[])).toMatchObject({
      ok: false,
      brokenAt: 2,
    });
  });

  it("detects a relinked (rehashed) entry", async () => {
    const { entries } = await threeEntries();
    const forged = entries.map((e, i) => (i === 2 ? { ...e, prevHash: GENESIS_HASH } : e));
    expect(await verifyChain(forged)).toEqual({
      ok: false,
      brokenAt: 3,
      reason: "prevHash does not link to previous entry",
    });
  });

  it("never forks the chain under concurrent appends", async () => {
    const log = new AuditLog(new MemoryAuditSink(), "buyer");
    await Promise.all(Array.from({ length: 25 }, (_, i) => log.append("payment.decision", { i })));
    expect(await verifyChain(await log.entries())).toMatchObject({ ok: true, length: 25 });
  });

  it("keeps working after a failing sink write", async () => {
    let fail = true;
    const inner = new MemoryAuditSink();
    const sink = {
      append: (e: AuditEntry) => (fail ? Promise.reject(new Error("disk full")) : inner.append(e)),
      readAll: () => inner.readAll(),
    };
    const log = new AuditLog(sink, "buyer");
    await expect(log.append("payment.decision", {})).rejects.toThrow("disk full");
    fail = false;
    await log.append("payment.decision", {});
    expect(await verifyChain(await log.entries())).toMatchObject({ ok: true, length: 1 });
  });

  it("persists to JSONL and resumes the chain across restarts", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "vc-audit-")), "nested", "audit.jsonl");
    await new AuditLog(new JsonlFileAuditSink(path), "buyer").append("payment.decision", { n: 1 });
    await new AuditLog(new JsonlFileAuditSink(path), "buyer").append("payment.decision", { n: 2 });
    const entries = await new JsonlFileAuditSink(path).readAll();
    expect(entries.map((e) => e.seq)).toEqual([1, 2]);
    expect(await verifyChain(entries)).toMatchObject({ ok: true });
    expect((await readFile(path, "utf8")).trim().split("\n")).toHaveLength(2);
  });

  it("reads an absent JSONL file as empty and surfaces other IO errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vc-audit-"));
    expect(await new JsonlFileAuditSink(join(dir, "none.jsonl")).readAll()).toEqual([]);
    await writeFile(join(dir, "file"), "x");
    await expect(
      new JsonlFileAuditSink(join(dir, "file", "sub.jsonl")).readAll(),
    ).rejects.toThrow();
  });
});
