import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { describe, expect, it } from "vitest";
import { verifyChain } from "../../src/audit/audit-log.js";
import { createGuard } from "../../src/factory.js";
import { PaymentRefusedError } from "../../src/payment/payment-guard.js";
import { SimulatedPayer, SIMULATED_SCHEME_MARKER } from "../../src/payment/payer.js";
import {
  advertisedBadge,
  X402_BADGE_EXTENSION,
  type PaymentRequired,
  type PaymentRequirements,
} from "../../src/payment/x402-types.js";
import {
  FakeRegistry,
  honestAgent,
  NOW,
  OWNER,
  routedFetch,
  SCAMMER,
  TESTNET,
  agentCard,
} from "../helpers.js";

const RESOURCE = "https://seller.example/api/quote";

function requirement(payTo: string, amount = "10000"): PaymentRequirements {
  return {
    scheme: "exact",
    network: TESTNET.caip2,
    asset: "CCD",
    amount,
    payTo,
    maxTimeoutSeconds: 60,
    extra: { feePayer: "4nkWEqH5534jL4LkSQAuL6zZdZugaU171DXqVvWB7uHbecuYS6" },
  };
}

function paymentRequired(accepts: PaymentRequirements[], badge?: string): PaymentRequired {
  return {
    x402Version: 2,
    resource: { url: RESOURCE },
    accepts,
    ...(badge ? { extensions: { [X402_BADGE_EXTENSION]: { tokenAddress: badge } } } : {}),
  };
}

async function setup(routes: Parameters<typeof routedFetch>[0] = {}) {
  const agent = await honestAgent();
  const registry = new FakeRegistry().add(agent.record);
  const fetch = routedFetch({ [agent.cardUrl]: agent.cardBody, ...routes });
  const parts = createGuard({
    registry,
    identity: null,
    fetch,
    clock: () => NOW,
    payer: new SimulatedPayer("buyer-1"),
  });
  return { agent, registry, fetch, ...parts };
}

describe("PaymentGuard.authorize", () => {
  it("allows a verified counterparty and writes the decision to the audit log", async () => {
    const { guard, agent, audit } = await setup();
    const auth = await guard.authorize(paymentRequired([requirement(OWNER)], agent.badge), {
      resourceUrl: RESOURCE,
      purpose: "buy a quote",
    });
    expect(auth).toMatchObject({
      decision: { verdict: "ALLOW" },
      badgeSource: "x402-extension",
      auditSeq: 1,
    });
    const [entry] = await audit.entries();
    expect(entry).toMatchObject({
      type: "payment.decision",
      data: {
        verdict: "ALLOW",
        purpose: "buy a quote",
        counterparty: { tokenId: "1190", owner: OWNER },
      },
    });
  });

  it("refuses an impersonator that reuses an honest agent's badge with its own payTo", async () => {
    const { guard, agent } = await setup();
    const auth = await guard.authorize(paymentRequired([requirement(SCAMMER)], agent.badge), {
      resourceUrl: RESOURCE,
    });
    expect(auth.decision.verdict).toBe("DENY");
    expect(auth.decision.failed.map((f) => f.id)).toEqual(["payee.bound"]);
  });

  it("prefers an out-of-band expected badge over the seller's claim", async () => {
    const { guard, agent } = await setup();
    const auth = await guard.authorize(
      paymentRequired([requirement(OWNER)], "JyP9TtQC3HCNrTYR3sc2T"),
      { resourceUrl: RESOURCE, expectedBadge: agent.badge },
    );
    expect(auth).toMatchObject({ badgeSource: "expected", decision: { verdict: "ALLOW" } });
  });

  it("discovers the badge from the seller's /.well-known/agent-card.json", async () => {
    const agent = await honestAgent();
    const { guard } = await setup({
      "https://seller.example/.well-known/agent-card.json": agentCard(agent.badge),
    });
    const auth = await guard.authorize(paymentRequired([requirement(OWNER)]), {
      resourceUrl: RESOURCE,
    });
    expect(auth).toMatchObject({ badgeSource: "agent-card", decision: { verdict: "ALLOW" } });
  });

  it("reads a badge from requirement.extra as a fallback", () => {
    const req = { ...requirement(OWNER), extra: { badge: "JyP9X278CKWoNLAFg5kVr" } };
    expect(advertisedBadge(paymentRequired([req]), req)).toBe("JyP9X278CKWoNLAFg5kVr");
    expect(advertisedBadge(paymentRequired([requirement(OWNER)]))).toBeNull();
  });

  it("denies a seller with no badge anywhere", async () => {
    const { guard } = await setup({
      "https://seller.example/.well-known/agent-card.json": '{"name":"anon"}',
    });
    const auth = await guard.authorize(paymentRequired([requirement(OWNER)]), {
      resourceUrl: RESOURCE,
    });
    expect(auth.badgeSource).toBe("none");
    expect(auth.decision.failed.map((f) => f.id)).toContain("badge.resolves");
  });

  it("survives an unreachable or invalid agent-card URL during discovery", async () => {
    const { guard } = await setup({
      "https://seller.example/.well-known/agent-card.json": () => Promise.reject(new Error("dns")),
    });
    expect(
      (await guard.authorize(paymentRequired([requirement(OWNER)]), { resourceUrl: RESOURCE }))
        .badgeSource,
    ).toBe("none");
    expect(
      (await guard.authorize(paymentRequired([requirement(OWNER)]), { resourceUrl: "not a url" }))
        .badgeSource,
    ).toBe("none");
  });

  it("picks the first acceptable option when the seller offers several", async () => {
    const { guard, agent } = await setup();
    const auth = await guard.authorize(
      paymentRequired([requirement(OWNER, "99999999"), requirement(OWNER, "5000")], agent.badge),
      { resourceUrl: RESOURCE },
    );
    expect(auth).toMatchObject({ decision: { verdict: "ALLOW" }, requirement: { amount: "5000" } });
  });

  it("evaluates a foreign-network option (and denies it) when nothing matches our network", async () => {
    const { guard, agent } = await setup();
    const foreign = { ...requirement(OWNER), network: "eip155:8453" as const };
    const auth = await guard.authorize(paymentRequired([foreign], agent.badge), {
      resourceUrl: RESOURCE,
    });
    expect(auth.decision.failed.map((f) => f.id)).toContain("network.allowed");
  });

  it("rejects a 402 with no payment options", async () => {
    const { guard } = await setup();
    await expect(
      guard.authorize(paymentRequired([]), { resourceUrl: RESOURCE }),
    ).rejects.toMatchObject({ code: "BAD_PAYMENT_REQUIRED" });
  });
});

describe("PaymentGuard.fetch", () => {
  function seller(pr: PaymentRequired, opts: { failSettle?: boolean } = {}) {
    let paidWith: string | null = null;
    const handler = (): Response => {
      if (paidWith === null)
        return new Response("{}", {
          status: 402,
          headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(pr) },
        });
      if (opts.failSettle)
        return new Response("{}", {
          status: 402,
          headers: {
            "PAYMENT-RESPONSE": encodePaymentResponseHeader({
              success: false,
              errorReason: "insufficient_funds",
              transaction: "",
              network: TESTNET.caip2,
            }),
          },
        });
      return new Response('{"quote":42}', {
        status: 200,
        headers: {
          "PAYMENT-RESPONSE": encodePaymentResponseHeader({
            success: true,
            transaction: "sim_abc",
            network: TESTNET.caip2,
            payer: "buyer-1",
          }),
        },
      });
    };
    return {
      handler,
      pay(h: string) {
        paidWith = h;
      },
      get paidWith() {
        return paidWith;
      },
    };
  }

  it("passes through non-402 responses untouched", async () => {
    const { guard } = await setup({ [RESOURCE]: '{"free":true}' });
    const out = await guard.fetch(RESOURCE);
    expect(out.authorization).toBeNull();
    expect(await out.response.json()).toEqual({ free: true });
  });

  it("reserves budget before signing and audits a payment the seller did not accept", async () => {
    const agent = await honestAgent();
    const s = seller(paymentRequired([requirement(OWNER)], agent.badge));
    const { guard, audit, ledger } = await setup({
      [RESOURCE]: () => s.handler(),
    });
    const out = await guard.fetch(RESOURCE, { headers: { accept: "application/json" } });
    expect(out.authorization?.decision.verdict).toBe("ALLOW");
    expect(ledger.spentInWindow("CCD", NOW)).toBe(10000n);
    const entries = await audit.entries();
    expect(entries.map((e) => e.type)).toEqual(["payment.decision", "payment.failed"]);
    expect(await verifyChain(entries)).toMatchObject({ ok: true });
  });

  it("sends a PAYMENT-SIGNATURE for the approved option and reads PAYMENT-RESPONSE", async () => {
    const agent = await honestAgent();
    const pr = paymentRequired([requirement(OWNER)], agent.badge);
    const s = seller(pr);
    const registry = new FakeRegistry().add(agent.record);
    const fetch = (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === agent.cardUrl) return Promise.resolve(new Response(agent.cardBody));
      const sig = new Headers(init?.headers).get("PAYMENT-SIGNATURE");
      if (sig) s.pay(sig);
      return Promise.resolve(s.handler());
    };
    const { guard, audit } = createGuard({ registry, identity: null, fetch, clock: () => NOW });
    const out = await guard.fetch(RESOURCE, {}, { purpose: "price check" });
    expect(out.response.status).toBe(200);
    expect(out.settlement).toMatchObject({ success: true, transaction: "sim_abc" });
    const decoded = JSON.parse(atob(s.paidWith ?? "")) as {
      accepted: PaymentRequirements;
      payload: Record<string, unknown>;
    };
    expect(decoded.accepted).toEqual(requirement(OWNER));
    expect(decoded.payload[SIMULATED_SCHEME_MARKER]).toBe(true);
    const entries = await audit.entries();
    expect(entries[1]).toMatchObject({
      type: "payment.settled",
      data: { simulated: true, transaction: "sim_abc", decisionSeq: 1 },
    });
  });

  it("records failed settlements", async () => {
    const agent = await honestAgent();
    const s = seller(paymentRequired([requirement(OWNER)], agent.badge), { failSettle: true });
    const fetch = (input: string | URL, init?: RequestInit) => {
      if (String(input) === agent.cardUrl) return Promise.resolve(new Response(agent.cardBody));
      const sig = new Headers(init?.headers).get("PAYMENT-SIGNATURE");
      if (sig) s.pay(sig);
      return Promise.resolve(s.handler());
    };
    const { guard, audit } = createGuard({
      registry: new FakeRegistry().add(agent.record),
      identity: null,
      fetch,
    });
    const out = await guard.fetch(RESOURCE);
    expect(out.response.status).toBe(402);
    expect((await audit.entries())[1]).toMatchObject({
      type: "payment.failed",
      data: { reason: "insufficient_funds" },
    });
  });

  it("throws PaymentRefusedError and never signs for a refused seller", async () => {
    const agent = await honestAgent();
    const s = seller(paymentRequired([requirement(SCAMMER)], agent.badge));
    let signed = false;
    const { guard } = await setup({ [RESOURCE]: () => s.handler() });
    const payerSpy = guard as unknown as { deps: { payer: { createPaymentHeaders: () => never } } };
    payerSpy.deps.payer.createPaymentHeaders = () => {
      signed = true;
      throw new Error("must not sign");
    };
    const err = await guard.fetch(RESOURCE).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentRefusedError);
    expect((err as PaymentRefusedError).authorization.decision.failed[0]?.id).toBe("payee.bound");
    expect(signed).toBe(false);
  });

  it("rejects a 402 that is not valid x402", async () => {
    const { guard } = await setup({
      [RESOURCE]: { status: 402, body: "pay me", headers: { "PAYMENT-REQUIRED": "%%%" } },
    });
    await expect(guard.fetch(RESOURCE)).rejects.toMatchObject({ code: "BAD_PAYMENT_REQUIRED" });
    const { guard: g2 } = await setup({ [RESOURCE]: { status: 402, body: "pay me" } });
    await expect(g2.fetch(RESOURCE)).rejects.toMatchObject({ code: "BAD_PAYMENT_REQUIRED" });
  });

  it("accepts PaymentRequired in the JSON body (x402 v1-style servers)", async () => {
    const agent = await honestAgent();
    const pr = paymentRequired([requirement(SCAMMER)], agent.badge);
    const { guard } = await setup({ [RESOURCE]: { status: 402, body: JSON.stringify(pr) } });
    await expect(guard.fetch(RESOURCE)).rejects.toBeInstanceOf(PaymentRefusedError);
  });
});
