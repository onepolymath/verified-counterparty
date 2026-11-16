/**
 * `pnpm demo`: runs every scenario against LIVE Concordium testnet and prints the verdicts.
 * Payment settlement is SIMULATED unless VC_BUYER_ACCOUNT / VC_BUYER_KEY are set.
 */
import { createGuard } from "../factory.js";
import { DEMO_AGENTS, paymentRequiredFor } from "../demo/scenarios.js";
import { verifyChain } from "../audit/audit-log.js";
import { JsonlFileAuditSink } from "../audit/jsonl-sink.js";

const auditPath = process.env["VC_AUDIT_PATH"] ?? "audit/demo.jsonl";
const { guard, audit } = createGuard({
  auditSink: new JsonlFileAuditSink(auditPath),
  actor: "demo-buyer-agent",
});

const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
console.log(`\nVerifiedCounterparty: live Concordium testnet\n`);
for (const agent of Object.values(DEMO_AGENTS)) {
  const pr = paymentRequiredFor(agent, `https://demo.seller/${agent.id}`);
  const auth = await guard.authorize(pr, { resourceUrl: pr.resource.url, purpose: "demo" });
  const icon = auth.decision.verdict === "ALLOW" ? "\u2705" : "\u26D4";
  const reason = auth.decision.failed[0]?.detail ?? "all checks passed";
  console.log(`${icon} ${pad(auth.decision.verdict, 5)} ${pad(agent.title, 26)} ${reason}`);
}
const check = await verifyChain(await audit.entries());
console.log(
  `\nAudit log ${auditPath}: ${check.ok ? `chain OK (${check.length} entries)` : `BROKEN at ${check.brokenAt}`}\n`,
);
