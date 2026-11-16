export function ShieldMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="vcg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.5 4.5 7v8.2c0 7.1 4.9 12.4 11.5 14.3 6.6-1.9 11.5-7.2 11.5-14.3V7L16 2.5Z"
        fill="url(#vcg)"
        opacity=".18"
        stroke="url(#vcg)"
        strokeWidth="1.6"
      />
      <path
        d="m10.5 16.2 3.8 3.8 7.4-8"
        fill="none"
        stroke="url(#vcg)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Outcome({ outcome }: { outcome: "pass" | "fail" | "skip" }) {
  if (outcome === "pass")
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-300 ring-1 ring-emerald-400/30">
        ✓
      </span>
    );
  if (outcome === "fail")
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-rose-500/15 text-[11px] font-bold text-rose-300 ring-1 ring-rose-400/30">
        ✕
      </span>
    );
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-500/15 text-[11px] font-bold text-slate-400 ring-1 ring-slate-400/20">
      –
    </span>
  );
}
