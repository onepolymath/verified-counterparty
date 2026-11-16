# Checkpoint 1 (22 Nov 2026): project, team, idea

**Project:** VerifiedCounterparty
**Team:** Yusuf Ojo Raifu (solo). GitHub: [@onepolymath](https://github.com/onepolymath)
**Repo:** <https://github.com/onepolymath/verified-counterparty>
**Live demo:** <https://verified-counterparty.vercel.app>
**Suggested direction(s):** agents check each other's badge before they deal; agents pay each other with sponsored fees; audit trails for EU AI Act record keeping.

## Idea (one paragraph)

AI agents increasingly pay other agents for data and APIs over x402, and nothing in that flow checks who is on the other side. VerifiedCounterparty is a drop-in guard for an agent's x402 wallet. Before any payment it resolves the seller's **Verified by Concordium** badge in the **Agent Registry** (via the hosted MCP server), re-hashes the seller's **ERC-8004/A2A Agent Card** against the on-chain anchor, binds `payTo` to the agent's on-chain wallet (defeating impersonators who copy a valid badge), checks the owner's **Identity Provider** credential, and applies the owner's spend policy. Every decision goes into a hash-chained audit log; only approved payments are signed, as **sponsored x402 transfers** so the agent never needs gas. Sellers get the reverse: serve only agents backed by ID-verified owners.

## Concordium components

Verified by Concordium badge · Agent Registry (CIS-8004 `<12802,0>` on testnet) · hosted MCP server · ERC-8004/A2A Agent Card · Concordium ID layer · x402 with sponsored fees (`@x402/concordium`).

## Status at checkpoint 1

- [x] Core library: verifier, policy engine (16 fail-closed rules), payment guard, hash-chained audit log, seller gate
- [x] 134 unit + HTTP integration tests, 99.8 % line coverage; live testnet test suite
- [x] Live demo on Vercel, verifying real testnet agents on every click (badge, card hash, payee binding, IdP credential)
- [x] Real `@x402/concordium` sponsored-transfer payer and `pnpm pay` CLI
- [ ] Our own buyer/seller agents registered with badges
- [ ] First real sponsored payment on testnet (CCDExplorer link)

## Plan to 9 Dec

| When            | Milestone                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 24–27 Nov       | Testnet wallet + identity; register seller and buyer agents; badges valid                                                   |
| 28 Nov–3 Dec    | Real x402 payment end to end via the sponsoring facilitator; CCDExplorer link in the UI; direct gRPC `agent_of` cross-check |
| 4–7 Dec         | MCP tool wrapper (`verify_counterparty`, `pay_if_verified`); audit-head anchoring                                           |
| 8 Dec           | Video, go-live plan polish, submission                                                                                      |
| 9 Dec 23:59 UTC | Submission deadline                                                                                                         |
