import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VerifiedCounterparty: agents that won't pay unverified agents",
  description:
    "An x402 payment guard for AI agents on Concordium: checks the seller's Verified by Concordium badge, Agent Card integrity and payee binding before any payment, and keeps a tamper-evident audit trail.",
  openGraph: {
    title: "VerifiedCounterparty",
    description: "Agents that won't pay agents they can't verify. Built on Concordium testnet.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-slate-200 antialiased">{children}</body>
    </html>
  );
}
