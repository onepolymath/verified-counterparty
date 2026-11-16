/**
 * `pnpm pay <url>`: buy one x402 resource with a REAL Concordium testnet payment,
 * after the guard has verified the seller. The buyer signs a sponsored transfer; the
 * facilitator pays the fee. Requires a funded testnet account:
 *
 *   VC_BUYER_ACCOUNT=<base58>  VC_BUYER_KEY=<hex ed25519 sign key>  pnpm pay https://seller/api
 *
 * The key is read from the environment only; it is never logged or written to disk.
 */
import { createGuard } from "../factory.js";
import { ConcordiumX402Payer } from "../payment/x402-concordium.js";
import { PaymentRefusedError } from "../payment/payment-guard.js";
import { JsonlFileAuditSink } from "../audit/jsonl-sink.js";
import { explorerLinks, NETWORKS } from "../networks.js";

const [url, badge] = process.argv.slice(2);
const account = process.env["VC_BUYER_ACCOUNT"];
const key = process.env["VC_BUYER_KEY"];
if (!url || !account || !key) {
  console.error("usage: VC_BUYER_ACCOUNT=… VC_BUYER_KEY=… pnpm pay <url> [expected-badge]");
  process.exit(2);
}

const { guard } = createGuard({
  payer: new ConcordiumX402Payer({ network: "testnet", account, privateKeyHex: key }),
  auditSink: new JsonlFileAuditSink(process.env["VC_AUDIT_PATH"] ?? "audit/payments.jsonl"),
  actor: `buyer:${account}`,
});

try {
  const { response, settlement } = await guard.fetch(
    url,
    {},
    { ...(badge ? { expectedBadge: badge } : {}), purpose: "cli purchase" },
  );
  console.log(`HTTP ${response.status}`);
  if (settlement?.transaction)
    console.log(`settled: ${explorerLinks.transaction(NETWORKS.testnet, settlement.transaction)}`);
  console.log(await response.text());
} catch (e) {
  if (e instanceof PaymentRefusedError) {
    console.error(`REFUSED: ${e.authorization.decision.summary}`);
    for (const f of e.authorization.decision.failed) console.error(`  ✕ ${f.title}: ${f.detail}`);
    process.exit(1);
  }
  throw e;
}
