/**
 * End-to-end over real HTTP: a local x402 seller, a local MCP registry speaking
 * JSON-RPC like Concordium's hosted server, and a buyer agent using the guard
 * through `McpRegistryClient`. Only the chain itself is replaced.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyChain } from "../../src/audit/audit-log.js";
import { JsonlFileAuditSink } from "../../src/audit/jsonl-sink.js";
import { createGuard } from "../../src/factory.js";
import { PaymentRefusedError } from "../../src/payment/payment-guard.js";
import { X402_BADGE_EXTENSION, type PaymentRequired } from "../../src/payment/x402-types.js";
import type { AgentRecord } from "../../src/registry/registry-client.js";
import { sha256Hex } from "../../src/util/crypto.js";
import { agentCard, badgeFor, OWNER, SCAMMER, TESTNET } from "../helpers.js";

let server: Server;
let base = "";
const records = new Map<string, AgentRecord>();
const cards = new Map<string, string>();
const received: string[] = [];

function send(
  res: ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body);
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function mcpResult(id: number, payload: unknown) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    result: { content: [{ type: "text", text: JSON.stringify(payload) }], isError: false },
  });
}

const HONEST = badgeFor(1190);
const TAMPERED = badgeFor(1191);

beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      const url = req.url ?? "/";
      if (url === "/mcp" && req.method === "POST") {
        const rpc = JSON.parse(await body(req)) as {
          id: number;
          params: { name: string; arguments: Record<string, string> };
        };
        const { name, arguments: args } = rpc.params;
        if (name === "agent_by_token_address")
          return send(
            res,
            200,
            mcpResult(rpc.id, records.get(args["token_address"] ?? "") ?? null),
          );
        if (name === "check_badge") {
          const rec = records.get(args["id"] ?? "");
          return send(
            res,
            200,
            `event: message\ndata: ${mcpResult(rpc.id, { badge_valid: !!rec, issues: rec ? [] : [{ message: "no CIS-8004 record found for this token" }] })}\n\n`,
            { "content-type": "text/event-stream" },
          );
        }
        return send(
          res,
          200,
          JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            error: { code: -32601, message: "unknown tool" },
          }),
        );
      }
      if (url.startsWith("/cards/")) {
        const card = cards.get(url);
        return card ? send(res, 200, card) : send(res, 404, "{}");
      }
      if (url.startsWith("/sell/")) {
        const [, , who] = url.split("/");
        const payTo = who === "impersonator" ? SCAMMER : OWNER;
        const badge = who === "tampered" ? TAMPERED : HONEST;
        const pr: PaymentRequired = {
          x402Version: 2,
          resource: { url: `${base}${url}`, description: "market quote" },
          accepts: [
            {
              scheme: "exact",
              network: TESTNET.caip2,
              asset: "CCD",
              amount: "10000",
              payTo,
              maxTimeoutSeconds: 60,
              extra: { feePayer: "4nkWEqH5534jL4LkSQAuL6zZdZugaU171DXqVvWB7uHbecuYS6" },
            },
          ],
          extensions: { [X402_BADGE_EXTENSION]: { tokenAddress: badge } },
        };
        const sig = req.headers["payment-signature"];
        if (typeof sig !== "string")
          return send(res, 402, "{}", { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(pr) });
        received.push(who ?? "");
        const payload = decodePaymentSignatureHeader(sig);
        expect(payload.accepted.payTo).toBe(payTo);
        return send(res, 200, '{"quote":101.5}', {
          "PAYMENT-RESPONSE": encodePaymentResponseHeader({
            success: true,
            transaction: "sim_tx_1",
            network: TESTNET.caip2,
            payer: "buyer",
          }),
        });
      }
      send(res, 404, "{}");
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  for (const [badge, id, tamper] of [
    [HONEST, "1190", false],
    [TAMPERED, "1191", true],
  ] as const) {
    const path = `/cards/${id}.json`;
    const anchored = agentCard(badge);
    cards.set(path, tamper ? agentCard(badge, OWNER, "Swapped After Anchoring") : anchored);
    records.set(badge, {
      network: "testnet",
      token_address: badge,
      token_id: id,
      owner_account: OWNER,
      agent_uri: `${base}${path}`,
      metadata_hash_hex: await sha256Hex(anchored),
      agent_wallet: OWNER,
      status: "Active",
      registered_at: "2026-11-01T00:00:00Z",
    });
  }
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("x402 flow with the payment guard (HTTP integration)", () => {
  it("pays a verified seller, refuses an impersonator and a tampered card, and leaves a verifiable audit trail", async () => {
    const auditPath = join(await mkdtemp(join(tmpdir(), "vc-int-")), "audit.jsonl");
    const { guard } = createGuard({
      config: { registry: { mcpUrl: `${base}/mcp` } },
      identity: null,
      auditSink: new JsonlFileAuditSink(auditPath),
      actor: "buyer-agent:test",
    });

    const ok = await guard.fetch(`${base}/sell/honest`, {}, { purpose: "integration test" });
    expect(ok.response.status).toBe(200);
    expect(await ok.response.json()).toEqual({ quote: 101.5 });
    expect(ok.settlement?.transaction).toBe("sim_tx_1");

    const imp = await guard.fetch(`${base}/sell/impersonator`).catch((e: unknown) => e);
    expect(imp).toBeInstanceOf(PaymentRefusedError);
    expect((imp as PaymentRefusedError).authorization.decision.failed.map((f) => f.id)).toEqual([
      "payee.bound",
    ]);

    const tam = await guard.fetch(`${base}/sell/tampered`).catch((e: unknown) => e);
    expect((tam as PaymentRefusedError).authorization.decision.failed.map((f) => f.id)).toEqual([
      "card.integrity",
    ]);

    expect(received).toEqual(["honest"]);

    const entries = await new JsonlFileAuditSink(auditPath).readAll();
    expect(entries.map((e) => `${e.type}:${String(e.data["verdict"] ?? "")}`)).toEqual([
      "payment.decision:ALLOW",
      "payment.settled:",
      "payment.decision:DENY",
      "payment.decision:DENY",
    ]);
    expect(await verifyChain(entries)).toMatchObject({ ok: true, length: 4 });
  });

  it("fails closed when the registry is down", async () => {
    const { guard } = createGuard({
      config: { registry: { mcpUrl: "http://127.0.0.1:1/mcp", timeoutMs: 500 } },
      identity: null,
    });
    const err = (await guard
      .fetch(`${base}/sell/honest`)
      .catch((e: unknown) => e)) as PaymentRefusedError;
    expect(err).toBeInstanceOf(PaymentRefusedError);
    expect(err.authorization.decision.failed.map((f) => f.id)).toContain("registry.reachable");
  });
});
