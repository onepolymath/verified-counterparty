"use client";

import {
  AuditLog,
  verifyChain,
  type AuditEntry,
  type ChainVerification,
} from "@verified-counterparty/core/audit";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EvaluateResponse } from "@/lib/evaluate";
import { LocalStorageAuditSink } from "@/lib/browser-audit";
import { Outcome } from "./icons";

export interface ScenarioCard {
  id: string;
  title: string;
  story: string;
  expected: "ALLOW" | "DENY";
  amount: string;
}

const ccd = (micro: string | undefined) =>
  micro ? `${(Number(micro) / 1e6).toLocaleString("en-GB", { maximumFractionDigits: 6 })} CCD` : "";
const short = (s: string | null | undefined, n = 6) =>
  !s ? "—" : s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;

export function Demo({ scenarios }: { scenarios: ScenarioCard[] }) {
  const sink = useMemo(
    () => (typeof window === "undefined" ? null : new LocalStorageAuditSink()),
    [],
  );
  const [log, setLog] = useState<AuditLog | null>(null);
  const [entries, setEntries] = useState<readonly AuditEntry[]>([]);
  const [chain, setChain] = useState<ChainVerification | null>(null);
  const [result, setResult] = useState<EvaluateResponse | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState({ badge: "", payTo: "", amount: "10000" });

  const refresh = useCallback(async () => {
    if (!sink) return;
    const all = await sink.readAll();
    setEntries(all);
    setChain(await verifyChain(all));
  }, [sink]);

  useEffect(() => {
    if (!sink) return;
    setLog(new AuditLog(sink, "demo-buyer-agent (this browser)"));
    void refresh();
  }, [sink, refresh]);

  async function run(body: object, key: string) {
    setRunning(key);
    setError(null);
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as EvaluateResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json);
      if (log) {
        const decision = await log.append("payment.decision", {
          verdict: json.verdict,
          summary: json.summary,
          counterparty: json.scenario.title,
          badge: json.evidence?.badge ?? null,
          payTo: json.intent?.payTo ?? null,
          amount: json.intent?.amount ?? null,
          failed: json.rules.filter((r) => r.outcome === "fail").map((r) => r.id),
        });
        if (json.settlement) {
          await log.append("payment.settled", {
            decisionSeq: decision.seq,
            simulated: true,
            transaction: json.settlement.transaction,
          });
        }
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="space-y-3 lg:col-span-4">
        <h2 className="px-1 text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">
          1 · Pick a seller agent
        </h2>
        {scenarios.map((s) => (
          <button
            key={s.id}
            onClick={() => void run({ scenario: s.id }, s.id)}
            disabled={running !== null}
            className={`glass group w-full rounded-2xl p-4 text-left transition hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-60 ${result?.scenario.id === s.id ? "ring-1 ring-sky-400/40" : ""}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-slate-100">{s.title}</span>
              <span className="text-[11px] text-slate-500">
                {running === s.id ? "verifying on testnet…" : `asks ${ccd(s.amount)}`}
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-snug text-slate-400">{s.story}</p>
          </button>
        ))}
        <details className="glass rounded-2xl p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-200">
            Try any testnet badge
          </summary>
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run({ custom }, "custom");
            }}
          >
            {(["badge", "payTo", "amount"] as const).map((k) => (
              <input
                key={k}
                value={custom[k]}
                onChange={(e) => {
                  setCustom({ ...custom, [k]: e.target.value });
                }}
                placeholder={
                  k === "badge"
                    ? "Badge, e.g. JyP9X278CKWoNLAFg5kVr"
                    : k === "payTo"
                      ? "payTo account address"
                      : "amount (microCCD)"
                }
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-400/50"
              />
            ))}
            <button
              disabled={running !== null}
              className="w-full rounded-lg bg-sky-500/90 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50"
            >
              {running === "custom" ? "Verifying…" : "Verify & decide"}
            </button>
          </form>
        </details>
      </section>

      <section className="space-y-4 lg:col-span-8">
        <h2 className="px-1 text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">
          2 · The buyer agent decides
        </h2>
        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        )}
        {!result && !error && (
          <div className="glass grid min-h-72 place-items-center rounded-2xl p-8 text-center text-slate-400">
            <div>
              <p className="text-lg text-slate-200">Choose a seller on the left.</p>
              <p className="mt-2 max-w-md text-sm">
                The buyer resolves the seller&apos;s badge on Concordium testnet, re-hashes its
                Agent Card, checks the payout address, and only then lets its x402 wallet sign.
              </p>
            </div>
          </div>
        )}
        {result && <Result r={result} />}
      </section>

      <section className="lg:col-span-12">
        <div className="glass rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">
                3 · Tamper-evident audit trail
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Every decision is hash-chained (SHA-256 over the previous entry), so edits,
                deletions and re-ordering are detectable.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {chain && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${chain.ok ? "bg-emerald-500/10 text-emerald-300 ring-emerald-400/30" : "bg-rose-500/10 text-rose-300 ring-rose-400/30"}`}
                >
                  {chain.ok
                    ? `Chain intact · ${chain.length} entries`
                    : `Tampering detected at #${chain.brokenAt}: ${chain.reason}`}
                </span>
              )}
              <button
                disabled={!entries.length}
                onClick={() => {
                  sink?.tamper(entries.find((e) => e.data["verdict"] === "DENY")?.seq ?? 1);
                  setLog(sink ? new AuditLog(sink, "demo-buyer-agent (this browser)") : null);
                  void refresh();
                }}
                className="rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-400/10 disabled:opacity-40"
              >
                Rewrite a refusal
              </button>
              <button
                onClick={() => {
                  sink?.clear();
                  setLog(sink ? new AuditLog(sink, "demo-buyer-agent (this browser)") : null);
                  void refresh();
                }}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  {["#", "time", "event", "counterparty", "verdict", "prevHash", "hash"].map(
                    (h) => (
                      <th key={h} className="py-2 pr-4 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="font-mono text-slate-300">
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center font-sans text-slate-500">
                      No decisions yet.
                    </td>
                  </tr>
                )}
                {[...entries].reverse().map((e) => {
                  const v = e.data["verdict"];
                  return (
                    <tr key={e.seq} className="border-t border-white/5">
                      <td className="py-2 pr-4 text-slate-500">{e.seq}</td>
                      <td className="py-2 pr-4">{new Date(e.ts).toLocaleTimeString("en-GB")}</td>
                      <td className="py-2 pr-4">{e.type}</td>
                      <td className="py-2 pr-4 font-sans">
                        {typeof e.data["counterparty"] === "string" ? (
                          e.data["counterparty"]
                        ) : e.type === "payment.settled" ? (
                          <span className="text-amber-300">simulated settlement</span>
                        ) : (
                          ""
                        )}
                      </td>
                      <td
                        className={`py-2 pr-4 font-semibold ${v === "ALLOW" ? "text-emerald-300" : v === "DENY" ? "text-rose-300" : "text-slate-400"}`}
                      >
                        {typeof v === "string" ? v : "—"}
                      </td>
                      <td className="py-2 pr-4 text-slate-500">{short(e.prevHash, 5)}</td>
                      <td className="py-2 pr-4">{short(e.hash, 5)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Result({ r }: { r: EvaluateResponse }) {
  const allow = r.verdict === "ALLOW";
  const ev = r.evidence;
  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl p-5 ring-1 ${allow ? "bg-emerald-500/10 ring-emerald-400/30" : "bg-rose-500/10 ring-rose-400/30"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`rounded-xl px-3 py-1.5 text-lg font-bold tracking-wide ${allow ? "bg-emerald-400 text-emerald-950" : "bg-rose-400 text-rose-950"}`}
            >
              {r.verdict}
            </span>
            <div>
              <p className="font-medium text-slate-100">{r.scenario.title}</p>
              <p className="text-xs text-slate-400">
                {ccd(r.intent?.amount)} to{" "}
                <span className="font-mono">{short(r.intent?.payTo)}</span> · decided in{" "}
                {r.elapsedMs} ms from live testnet data
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-400">badge via {r.badgeSource}</span>
        </div>
        <div className="mt-4 rounded-xl bg-black/25 p-3 text-sm">
          {allow && r.settlement ? (
            <p>
              <span className="mr-2 rounded bg-amber-400/20 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-amber-200 ring-1 ring-amber-300/30">
                MOCKED
              </span>
              x402 payment authorised →{" "}
              <span className="font-mono text-slate-300">
                {short(r.settlement.transaction, 10)}
              </span>
              <span className="block pt-1 text-xs text-slate-400">{r.settlement.note}</span>
            </p>
          ) : (
            <p className="text-rose-100">
              No payment signed. The wallet was never asked.{" "}
              <span className="text-rose-200/70">
                Reason: {r.rules.find((x) => x.outcome === "fail")?.detail}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-200">Policy checks</h3>
          <ul className="space-y-2">
            {r.rules.map((rule) => (
              <li key={rule.id} className="flex gap-2.5">
                <Outcome outcome={rule.outcome} />
                <div className="min-w-0">
                  <p
                    className={`text-[13px] leading-5 ${rule.outcome === "fail" ? "text-rose-200" : rule.outcome === "skip" ? "text-slate-500" : "text-slate-200"}`}
                  >
                    {rule.title}
                  </p>
                  <p className="truncate font-mono text-[11px] text-slate-500" title={rule.detail}>
                    {rule.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="glass space-y-3 rounded-2xl p-4 text-[13px]">
          <h3 className="text-sm font-medium text-slate-200">On-chain evidence</h3>
          <Field
            label="Badge (CIS-8004 token)"
            value={ev?.badge ?? "—"}
            href={r.links.badgeCheck}
            mono
          />
          <Field
            label="Agent"
            value={
              ev?.card.name ?? (ev?.record ? `token #${ev.record.token_id}` : "not registered")
            }
          />
          <Field
            label="Registry"
            value={
              ev?.decoded ? `CIS-8004 <${ev.decoded.registry}>, token #${ev.decoded.tokenId}` : "—"
            }
            href={r.links.registry}
          />
          <Field
            label="Owner account"
            value={short(ev?.record?.owner_account, 8)}
            href={r.links.owner}
            mono
          />
          <Field label="On-chain payout wallet" value={short(ev?.payee?.boundAccount, 8)} mono />
          <Field
            label="Seller's payTo"
            value={short(r.intent?.payTo, 8)}
            href={r.links.payTo}
            mono
            warn={ev?.payee ? !ev.payee.matches : false}
          />
          <Field
            label="Card SHA-256 (we computed)"
            value={short(ev?.card.sha256, 10)}
            mono
            warn={!ev?.card.hashMatches}
          />
          <Field label="metadata_hash (on chain)" value={short(ev?.card.onChainHash, 10)} mono />
          <Field
            label="Owner identity"
            value={
              !ev?.identity
                ? "—"
                : ev.identity.status === "verified"
                  ? `credential from Identity Provider #${ev.identity.identityProviders.join(", #")}`
                  : ev.identity.status === "absent"
                    ? "no IdP credential"
                    : "node unreachable (skipped)"
            }
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  href,
  mono,
  warn,
}: {
  label: string;
  value: string;
  href?: string | null;
  mono?: boolean;
  warn?: boolean;
}) {
  const cls = `${mono ? "font-mono text-xs" : ""} ${warn ? "text-rose-300" : "text-slate-200"}`;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2 last:border-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={`${cls} truncate underline decoration-white/20 underline-offset-2 hover:decoration-sky-400`}
        >
          {value}
        </a>
      ) : (
        <span className={`${cls} truncate`}>{value}</span>
      )}
    </div>
  );
}
