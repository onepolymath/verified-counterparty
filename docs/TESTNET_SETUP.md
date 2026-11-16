# Testnet setup (for real payments and our own badges)

Everything in the live demo works without this. You need it to (a) register **our own** agents with Verified by Concordium badges and (b) make a **real** x402 payment on testnet.

> Testnet CCD is free and has no value. Never reuse a testnet key on mainnet, and never commit keys.

## 1. Wallet, identity, account (≈10 minutes, done by the owner)

1. Install **Concordium Wallet for Web** (Chromium extension) and create a new wallet. Write the 24-word phrase down offline.
2. Menu → **Network → Testnet** (the UI turns green).
3. Menu → **ID Cards → Request Identity**. On testnet, identities are issued without document checks (choose the Concordium testnet identity provider). On mainnet this step is a real ID check.
4. **Create account** from that identity. Create two: `vc-buyer` and `vc-seller`.
5. Fund each with the faucet, from the wallet (“Request CCD”) or:

   ```bash
   curl -X PUT https://wallet-proxy.testnet.concordium.com/v0/testnetGTUDrop/<ACCOUNT_ADDRESS>
   ```

6. For the buyer only: **Accounts → Export (Private key) → Copy account private key**. Put it in `.env` as `VC_BUYER_KEY`, and the address as `VC_BUYER_ACCOUNT`. `.env` is git-ignored.

## 2. Register the seller agent and get its badge

1. Build the card with Concordium's MCP tool `build_agent_card` (or the registry UI at <https://agent-registry.concordium.com>, testnet), host it at a stable URL (e.g. `apps/web/public/.well-known/agent-card.json` on the Vercel deployment) and note its SHA-256:

   ```bash
   curl -s https://<host>/.well-known/agent-card.json | sha256sum
   ```

2. Register: the MCP tool `build_register` returns a sign-ready payload (`agent_uri`, `metadata_hash_hex`, `sender`); sign and submit it with the `vc-seller` account in the wallet (or the registry UI).
3. Add the badge to the card: `GET https://agent-registry-mcp.concordium.com/v1/get-badge-JSON/<badge>`, paste `extension` into `capabilities.extensions`, re-host, then pin the new hash with `build-set-agent-uri`.
4. Confirm: `GET https://agent-registry-mcp.concordium.com/v1/check-badge/<badge>` → `badge_valid: true`.
5. Use the badge in `packages/core/src/demo/scenarios.ts` (`verified`) so the demo pays **our** seller.

## 3. Real payment

The public facilitator (`https://concordium-facilitator.onrender.com`) sponsors fees for allow-listed sellers with a daily limit. Either ask its operator to allow-list `vc-seller`, or run your own facilitator with `@x402/concordium/exact/facilitator` and a third funded account.

```bash
VC_BUYER_ACCOUNT=… VC_BUYER_KEY=… pnpm pay https://<seller>/api/quote <seller-badge>
```

The command prints a CCDExplorer link for the settled transaction. That link is the hackathon's required **CCDExplorer link**.
