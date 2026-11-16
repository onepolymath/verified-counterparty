const DAY_MS = 24 * 60 * 60 * 1000;

interface Spend {
  readonly asset: string;
  readonly amount: bigint;
  readonly at: number;
}

/** Rolling 24-hour spend tracker, per asset. Amounts are atomic units (bigint, no float maths). */
export class SpendLedger {
  private spends: Spend[] = [];

  constructor(private readonly windowMs = DAY_MS) {}

  record(asset: string, amount: bigint, at: Date): void {
    if (amount < 0n) throw new RangeError("spend amount must be non-negative");
    this.spends.push({ asset, amount, at: at.getTime() });
  }

  spentInWindow(asset: string, now: Date): bigint {
    const from = now.getTime() - this.windowMs;
    this.spends = this.spends.filter((s) => s.at > from);
    return this.spends.filter((s) => s.asset === asset).reduce((sum, s) => sum + s.amount, 0n);
  }
}
