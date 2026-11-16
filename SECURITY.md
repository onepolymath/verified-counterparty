# Security policy

VerifiedCounterparty sits on the payment path of autonomous agents, so we treat bypasses of the guard as security issues.

**Please report privately** via [GitHub security advisories](https://github.com/onepolymath/verified-counterparty/security/advisories/new). Include the badge / payTo / 402 payload that reproduces it (testnet only, never real keys).

In scope: any way to get the guard to `ALLOW` a payment that the [threat model](docs/THREAT_MODEL.md) says it should refuse, audit-chain forgeries, and key leakage.

This is hackathon-stage software running on Concordium **testnet**. Do not use it with mainnet funds yet.
