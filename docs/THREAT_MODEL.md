# Threat model

VerifiedCounterparty protects a **buyer agent's owner** from paying the wrong party. It assumes the agent itself is honest but naive: it will pay whatever a 402 asks unless something stops it.

## Assets

- Funds in the buyer agent's x402 wallet.
- The owner's accountability record: what the agent paid, to whom, and why.

## Trust assumptions

| We trust                                                                                         | We do not trust                                                                                   |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Concordium consensus and the CIS-8004 contract(s) on our `trustedRegistries` list                | The seller, its 402 body, its headers, its badge claim, its Agent Card                            |
| Concordium's identity layer: an account credential's Identity Provider id was issued by that IdP | Any single off-chain service, including the hosted badge resolver (used as a second opinion only) |
| The machine running the guard and its signing key                                                | The network path to the seller                                                                    |

The hosted MCP server is used to _read_ chain state. A compromised MCP server could lie about a record; mitigations are listed under residual risks.

## Attacks and defences

| #   | Attack                                                                                                                                                        | Defence                                                                                                                                                            | Rule id                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| T1  | **Badge reuse / impersonation.** A scam endpoint puts an honest agent's badge (or a copy of its whole card) into its 402 and sets `payTo` to its own account. | `payTo` must equal the agent's on-chain `agent_wallet` (or owner if unset). The badge proves who the honest agent is; it cannot redirect where that agent is paid. | `payee.bound`                           |
| T2  | **Card swap.** The seller edits its Agent Card after anchoring (new name, new endpoints).                                                                     | We fetch the card ourselves and compare SHA-256 of the served bytes with `metadata_hash` on chain.                                                                 | `card.integrity`                        |
| T3  | **Borrowed badge.** A registered agent embeds another agent's badge in its own card.                                                                          | The card's badge block must name the same token and owner as the on-chain record.                                                                                  | `card.self_reference`                   |
| T4  | **Fake badge.** Well-formed string, never minted.                                                                                                             | On-chain lookup must return a record.                                                                                                                              | `badge.resolves`                        |
| T5  | **Rogue registry.** Attacker deploys its own CIS-8004 contract and mints itself a badge.                                                                      | The badge is Base58Check-decoded locally to its contract address, which must be on the trusted list (default: the official registry for the network).              | `registry.trusted`                      |
| T6  | **Revoked agent.**                                                                                                                                            | Status must be `Active`.                                                                                                                                           | `badge.active`                          |
| T7  | **No accountable human.**                                                                                                                                     | Owner account must carry a credential issued by a Concordium Identity Provider. Mode `always` makes this mandatory; `if-available` tolerates a node outage.        | `identity.credential`                   |
| T8  | **Fresh sybils.** Mint-and-scam agents.                                                                                                                       | Optional minimum registration age.                                                                                                                                 | `registration.age`                      |
| T9  | **Over-charging / drain.** Legit or compromised seller asks too much, or many times.                                                                          | Per-payment cap and rolling 24h budget per asset, in `bigint` atomic units; budget is reserved _before_ signing so concurrent calls can't overspend.               | `amount.cap`, `budget.daily`            |
| T10 | **Wrong network / asset.** Seller asks for mainnet or an unexpected token.                                                                                    | Network and asset allow-lists.                                                                                                                                     | `network.allowed`, `asset.allowed`      |
| T11 | **Outage as a bypass.** Registry or resolver unreachable.                                                                                                     | Registry unreachable ⇒ deny. Resolver unreachable ⇒ our own checks stand (it is a second opinion).                                                                 | `registry.reachable`, `resolver.agrees` |
| T12 | **Option smuggling.** 402 offers several options hoping the wallet picks a bad one.                                                                           | Each option is evaluated; the payer only ever receives the single approved requirement.                                                                            | —                                       |
| T13 | **History rewriting.** Someone edits, deletes or reorders the audit trail to hide a bad payment.                                                              | Each entry commits to the previous one with SHA-256; `verifyChain` detects edits, deletions and relinks. Appends are serialised.                                   | —                                       |
| T14 | **Oversized / slow cards** used to stall the agent.                                                                                                           | 256 KiB cap, HTTPS only, no redirects, hard timeouts on every fetch.                                                                                               | —                                       |
| T15 | **Key leakage.**                                                                                                                                              | Keys only from env; never logged, never in the audit log, `.env*` git-ignored. The demo has no keys at all.                                                        | —                                       |

## Residual risks and next steps

- **Compromised read path.** A malicious MCP server could forge a record _and_ a matching card. Next: read CIS-8004 state directly over gRPC (`invokeInstance agent_of`) and require agreement with the MCP response.
- **Honest-but-malicious verified sellers.** A badge proves accountability, not good behaviour. Caps, budgets and the audit trail limit and evidence the damage; reputation signals are on the roadmap.
- **Audit log deletion.** A hash chain detects tampering but not wholesale deletion of the tail. Next: periodically anchor the chain head on Concordium (memo on a sponsored transfer) or in an external timestamping service.
- **Testnet identities are unverified.** On testnet, identity providers issue identities without document checks, so `identity.credential` demonstrates the mechanism only. On mainnet the same check implies a real KYC'd person; the go-live plan sets it to `always` there.
- **IdP credential ≠ specific attributes.** We prove an IdP-verified person controls the owner account, not their age or jurisdiction. Next: zero-knowledge verifiable presentations for attribute policies.
