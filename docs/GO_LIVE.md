# Go-live plan

## Who it is for

1. **Agent builders** whose agents pay for APIs over x402 (data, inference, search). They need a "don't get scammed" switch they can add in one line.
2. **API sellers on agent marketplaces** who want to serve only accountable agents (`SellerGate`) and prove to buyers that they are who they say they are (badge + anchored card).
3. **Compliance owners** who need a record of what autonomous agents paid and why (EU AI Act Art. 12-style logging).

## Product

| Tier                | What                                                                                                       | Price (indicative)                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Open source         | `@verified-counterparty/core`: guard, verifier, policy engine, audit log, seller gate                      | Free (MIT)                                                             |
| Hosted              | Managed policy packs, audit-log storage with periodic on-chain anchoring, dashboard and alerts on refusals | Free up to 1k decisions/month, then usage-based (~$0.001 per decision) |
| Seller verification | Badge + card onboarding for API sellers, `SellerGate` hosted middleware                                    | Flat monthly fee per seller                                            |

## Path to mainnet

1. **Testnet hardening (Dec 2026).** Register our own buyer and seller agents with badges; run real sponsored x402 payments end to end; publish CCDExplorer links; add the direct gRPC `agent_of` cross-check.
2. **Mainnet switch.** `VC_NETWORK=mainnet` already resolves the official registry `<10082,0>`, mainnet CAIP-2 and gRPC. Run our own facilitator (or a partner's) with an allow-list, a daily cap and monitoring. Default to `requireIdentityCredential: "always"` on mainnet.
3. **Distribution.** Publish to npm; ship an MCP server (`verify_counterparty`, `pay_if_verified`) so any MCP-capable agent framework can use it with zero code; ship middleware for the common x402 seller frameworks.
4. **First users.** Five design partners from the hackathon cohort and the Concordium agent-registry community (sellers already registered on testnet), then x402 marketplace listings.
5. **Funding.** Apply to Concordium's 75M CCD grants programme after the hackathon with usage numbers (decisions/day, refused payments, value protected).

## Success metrics

- Payments evaluated per day and refusal rate.
- Value of refused payments (scam money not sent).
- Number of sellers with a badge + anchored card that pass the guard.
- Time added per payment (target: < 300 ms p50; the hosted demo decides in ~200–700 ms with live chain reads).

## Risks

- Ecosystem adoption of badges: mitigated by `SellerGate` and seller onboarding, which give sellers a reason to register.
- Facilitator dependency: we can run our own using `@x402/concordium`'s facilitator scheme.
