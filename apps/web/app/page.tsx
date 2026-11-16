import { DEMO_AGENTS, explorerLinks, NETWORKS } from "@verified-counterparty/core";
import { Demo, type ScenarioCard } from "@/components/Demo";
import { ShieldMark } from "@/components/icons";

const REPO = "https://github.com/onepolymath/verified-counterparty";

export default function Home() {
  const scenarios: ScenarioCard[] = Object.values(DEMO_AGENTS).map(
    ({ id, title, story, expected, amount }) => ({ id, title, story, expected, amount }),
  );
  const t = NETWORKS.testnet;

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ShieldMark />
          <span className="font-semibold tracking-tight text-slate-100">VerifiedCounterparty</span>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <span className="hidden items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300 ring-1 ring-emerald-400/25 sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Concordium
            testnet · live
          </span>
          <a
            href={REPO}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/5"
          >
            GitHub
          </a>
        </nav>
      </header>

      <section className="py-12 sm:py-16">
        <p className="text-xs font-semibold tracking-[0.2em] text-sky-300/80 uppercase">
          Concordium Trusted Agents Hackathon
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl leading-[1.08] font-semibold tracking-tight text-white sm:text-5xl">
          Agents that won&apos;t pay agents{" "}
          <span className="bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text text-transparent">
            they can&apos;t verify.
          </span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
          A drop-in guard for x402 wallets. Before an AI agent pays another agent, it proves on
          Concordium that a verified human stands behind the seller, that the seller&apos;s Agent
          Card is the one anchored on chain, and that the money goes to the seller&apos;s own
          wallet. Every decision lands in a tamper-evident audit log.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-300">
          {[
            "Verified by Concordium badge",
            "CIS-8004 Agent Registry over MCP",
            "ERC-8004 / A2A Agent Card",
            "x402 with sponsored fees",
            "EU AI Act-style record keeping",
          ].map((x) => (
            <span key={x} className="glass rounded-full px-3 py-1">
              {x}
            </span>
          ))}
        </div>
      </section>

      <Demo scenarios={scenarios} />

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="glass rounded-2xl p-5 text-sm">
          <h2 className="font-medium text-slate-100">What&apos;s real here</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
            <li>
              Every badge is resolved live against the testnet Agent Registry{" "}
              <a className="underline" href={explorerLinks.contract(t, t.cis8004)}>
                CIS-8004 &lt;12802,0&gt;
              </a>{" "}
              through Concordium&apos;s hosted MCP server.
            </li>
            <li>Agent Cards are fetched and re-hashed by us, not trusted from the resolver.</li>
            <li>The owner&apos;s Identity Provider credential is read from the chain over gRPC.</li>
            <li>
              The policy engine and hash-chained audit log are the production code from the repo.
            </li>
          </ul>
        </div>
        <div className="glass rounded-2xl p-5 text-sm">
          <h2 className="font-medium text-amber-200">What&apos;s mocked (labelled MOCKED)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
            <li>
              Settlement: the hosted demo moves no funds. The repo ships the real{" "}
              <code>@x402/concordium</code> sponsored-transfer payer for a funded testnet buyer.
            </li>
            <li>
              The sellers&apos; 402 responses are generated from the scenario; their badges are real
              third-party testnet agents.
            </li>
            <li>The audit log lives in your browser&apos;s localStorage for the demo.</li>
          </ul>
        </div>
      </section>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-6 text-xs text-slate-500">
        <span>
          MIT · Built by Yusuf Ojo Raifu for the Concordium Trusted Agents Hackathon (Encode Club,
          2026).
        </span>
        <a className="hover:text-slate-300" href={REPO}>
          Source, tests and threat model →
        </a>
      </footer>
    </main>
  );
}
