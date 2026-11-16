# Contributing

Thanks for helping make agent payments safer.

## Setup

```bash
corepack enable
pnpm install
pnpm --filter @verified-counterparty/core build
```

Node 22 (see `.nvmrc`) and pnpm 10.

## The loop

```bash
pnpm lint          # ESLint (typescript-eslint strict, type-aware)
pnpm format:check  # Prettier
pnpm typecheck     # tsc --noEmit across the workspace
pnpm test          # unit + HTTP integration tests (offline)
pnpm test:coverage # same, with the coverage gate (90% lines / 85% branches)
pnpm test:live     # opt-in checks against live Concordium testnet
pnpm dev           # demo UI on http://localhost:3000
```

## Ground rules

- **Fail closed.** A new policy rule must deny when evidence is missing or a dependency is down, unless the policy explicitly relaxes it. Add tests for `pass`, `fail` and `skip`.
- **Evidence and decisions stay separate.** The verifier only collects facts; the policy engine is pure and deterministic; the guard orchestrates. Keep I/O out of `policy/`.
- **Never trust the counterparty.** Anything a seller sends (badge, card, 402 body) is a claim to be checked against the chain.
- **Label mocks.** If something is simulated, say so in code, README and UI.
- **No secrets in git.** Keys come from the environment only. `.env*` is ignored.

## Commits and PRs

We use [Conventional Commits](https://www.conventionalcommits.org/) (`feat(policy): …`, `fix(verifier): …`, `docs: …`). Keep PRs focused, fill in the template, and make sure CI is green.

## Reporting security issues

Please use GitHub's private vulnerability reporting rather than a public issue.
