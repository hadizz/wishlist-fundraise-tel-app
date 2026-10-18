import { env } from "../env";

export const STARS = "XTR";

/** Minor units credited to a product in `currency` for `stars` Stars. */
export function starsToMinor(stars: number, currency: string): { amountMinor: number; rate: number } {
  if (currency === STARS) return { amountMinor: stars, rate: 1 };
  const rate = env.STARS_RATES[currency];
  if (!rate) throw new Error(`no Stars rate configured for ${currency}`);
  return { amountMinor: Math.floor(stars * rate), rate };
}

/** Stars needed to cover `minor` units of `currency` (rounded up). */
export function minorToStars(minor: number, currency: string): number {
  if (currency === STARS) return minor;
  const rate = env.STARS_RATES[currency];
  if (!rate) throw new Error(`no Stars rate configured for ${currency}`);
  return Math.ceil(minor / rate);
}

const DECIMALS: Record<string, number> = { XTR: 0, JPY: 0, KRW: 0 };
export function formatMoney(minor: number, currency: string): string {
  if (currency === STARS) return `${minor} ⭐`;
  const d = DECIMALS[currency] ?? 2;
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(minor / 10 ** d);
}

export function progressBar(funded: number, goal: number, width = 10): string {
  const pct = Math.min(1, funded / goal);
  const full = Math.round(pct * width);
  return "▓".repeat(full) + "░".repeat(width - full) + ` ${Math.floor((funded / goal) * 100)}%`;
}
