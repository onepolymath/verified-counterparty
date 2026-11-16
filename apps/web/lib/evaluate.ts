import "server-only";
import {
  createGuard,
  DEMO_AGENTS,
  explorerLinks,
  NETWORKS,
  paymentRequiredFor,
  sha256Hex,
  type DemoAgent,
  type ScenarioId,
} from "@verified-counterparty/core";
import { z } from "zod";

const SCENARIOS = Object.keys(DEMO_AGENTS) as [ScenarioId, ...ScenarioId[]];

export const EvaluateRequest = z.union([
  z.object({ scenario: z.enum(SCENARIOS) }),
  z.object({
    custom: z.object({
      badge: z.string().trim().min(1).max(120),
      payTo: z
        .string()
        .trim()
        .regex(/^[1-9A-HJ-NP-Za-km-z]{45,55}$/, "payTo must be a Concordium account address"),
      amount: z.string().regex(/^\d{1,12}$/),
    }),
  }),
]);
export type EvaluateRequest = z.infer<typeof EvaluateRequest>;

const testnet = NETWORKS.testnet;

export async function evaluate(req: EvaluateRequest) {
  const agent: DemoAgent =
    "scenario" in req
      ? DEMO_AGENTS[req.scenario]
      : {
          id: "verified",
          title: "Custom counterparty",
          story: "A badge and payout address you supplied.",
          expected: "ALLOW",
          ...req.custom,
        };

  const started = Date.now();
  const { guard } = createGuard({ actor: "demo-buyer-agent" });
  const pr = paymentRequiredFor(
    agent,
    `https://seller.demo/${"scenario" in req ? req.scenario : "custom"}/quote`,
  );
  const auth = await guard.authorize(pr, {
    resourceUrl: pr.resource.url,
    purpose: "buy one market-data quote",
  });
  const ev = auth.evidence;
  const allowed = auth.decision.verdict === "ALLOW";

  return {
    scenario: {
      id: "scenario" in req ? req.scenario : "custom",
      title: agent.title,
      story: agent.story,
    },
    verdict: auth.decision.verdict,
    summary: auth.decision.summary,
    rules: auth.decision.results,
    badgeSource: auth.badgeSource,
    intent: auth.requirement,
    evidence: ev && {
      badge: ev.tokenAddress,
      decoded: ev.decoded,
      record: ev.record,
      card: ev.card,
      resolver: ev.resolver,
      payee: ev.payee,
      identity: ev.identity,
      collectedAt: ev.collectedAt,
    },
    links: {
      registry: explorerLinks.contract(testnet, testnet.cis8004),
      owner: ev?.record ? explorerLinks.account(testnet, ev.record.owner_account) : null,
      payTo: explorerLinks.account(testnet, agent.payTo),
      badgeCheck: ev?.tokenAddress
        ? `https://agent-registry-mcp.concordium.com/v1/check-badge/${ev.tokenAddress}`
        : null,
    },
    // MOCKED: no funds move in the hosted demo. See README "Real vs mocked".
    settlement: allowed
      ? {
          simulated: true as const,
          transaction: `sim_${(await sha256Hex(`${agent.payTo}:${agent.amount}:${started}`)).slice(0, 40)}`,
          network: testnet.caip2,
          note: "Simulated settlement. A funded testnet buyer would send a sponsored x402 transfer here.",
        }
      : null,
    elapsedMs: Date.now() - started,
  };
}

export type EvaluateResponse = Awaited<ReturnType<typeof evaluate>>;
