/**
 * Money helpers. Amounts are stored as numeric(14,2) and arrive as strings or
 * numbers; all arithmetic is done in integer cents to avoid float drift.
 * Different currencies are NEVER summed together — totals are grouped by currency.
 */
export const SUPPORTED_CURRENCIES = ["USD", "ZWG", "ZAR", "EUR", "GBP", "BWP"] as const;

export function toCents(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === "") return 0;
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export type CurrencyTotals = Record<string, number>; // currency -> cents

export function addTo(totals: CurrencyTotals, currency: string, cents: number) {
  totals[currency] = (totals[currency] ?? 0) + cents;
}

export function formatMoney(amount: number | string, currency: string, opts?: { compact?: boolean; signed?: boolean }) {
  const n = typeof amount === "number" ? amount : Number(amount);
  // ZWG (Zimbabwe Gold) is not in every ICU build; format it manually for consistency.
  const formatted = (() => {
    try {
      if (currency === "ZWG") throw new Error("manual");
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        notation: opts?.compact ? "compact" : "standard",
        maximumFractionDigits: opts?.compact ? 1 : 2,
        minimumFractionDigits: opts?.compact ? 0 : 2,
      }).format(Math.abs(n));
    } catch {
      return (
        `${currency} ` +
        new Intl.NumberFormat("en-US", {
          notation: opts?.compact ? "compact" : "standard",
          maximumFractionDigits: opts?.compact ? 1 : 2,
          minimumFractionDigits: opts?.compact ? 0 : 2,
        }).format(Math.abs(n))
      );
    }
  })();
  const sign = n < 0 ? "-" : opts?.signed && n > 0 ? "+" : "";
  return sign + formatted;
}

export function formatCents(cents: number, currency: string, opts?: { compact?: boolean; signed?: boolean }) {
  return formatMoney(fromCents(cents), currency, opts);
}
