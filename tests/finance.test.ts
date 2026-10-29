import { describe, expect, it } from "vitest";
import { advanceDate, billDueState, budgetStatus, expensesByCategory, lastMonths, monthlySeries, outstandingCents, periodRange, summarize } from "@/lib/finance";
import { formatMoney, toCents } from "@/lib/money";
import type { Budget } from "@/lib/types";

const tx = (o: Partial<{ type: "income" | "expense"; amount: string | number; currency: string; category_id: string | null; business_id: string | null; occurred_on: string }>) => ({
  type: "expense" as const, amount: "10.00", currency: "USD", category_id: null, business_id: null, occurred_on: "2026-10-15", ...o,
});

describe("money", () => {
  it("avoids float drift with cents", () => {
    expect(toCents("0.1") + toCents("0.2")).toBe(30);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents("abc")).toBe(0);
  });
  it("formats ZWG and USD", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
    expect(formatMoney(-50, "ZWG")).toBe("-ZWG 50.00");
  });
});

describe("periodRange", () => {
  it("monthly / quarterly / annual", () => {
    expect(periodRange("monthly", "2026-12-31")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
    expect(periodRange("quarterly", "2026-11-03")).toEqual({ start: "2026-10-01", end: "2027-01-01" });
    expect(periodRange("quarterly", "2026-05-03")).toEqual({ start: "2026-04-01", end: "2026-07-01" });
    expect(periodRange("annual", "2026-05-03")).toEqual({ start: "2026-01-01", end: "2027-01-01" });
  });
});

describe("summarize", () => {
  it("groups by currency and never mixes", () => {
    const s = summarize([
      tx({ type: "income", amount: "1000.10" }),
      tx({ amount: "200.05" }),
      tx({ amount: "50", currency: "ZWG" }),
    ]);
    expect(s.income).toEqual({ USD: 100010 });
    expect(s.expense).toEqual({ USD: 20005, ZWG: 5000 });
    expect(s.net).toEqual({ USD: 80005, ZWG: -5000 });
  });
  it("ranks categories", () => {
    const r = expensesByCategory([tx({ category_id: "a", amount: 5 }), tx({ category_id: "b", amount: 7 }), tx({ category_id: "a", amount: 3 })]);
    expect(r[0]).toMatchObject({ categoryId: "a", cents: 800 });
  });
});

describe("budgetStatus", () => {
  const budget: Budget = { id: "b", business_id: null, category_id: "food", name: "Food", amount: "100.00", currency: "USD", period: "monthly", alert_thresholds: [80, 100], active: true };
  it("counts only matching scope/category/currency/period", () => {
    const st = budgetStatus(budget, [
      tx({ category_id: "food", amount: "50" }),
      tx({ category_id: "food", amount: "35" }),
      tx({ category_id: "food", amount: "999", currency: "ZWG" }),
      tx({ category_id: "food", amount: "999", business_id: "biz" }),
      tx({ category_id: "other", amount: "999" }),
      tx({ category_id: "food", amount: "999", occurred_on: "2026-09-30" }),
      tx({ category_id: "food", amount: "999", type: "income" }),
    ], "2026-10-20");
    expect(st.spentCents).toBe(8500);
    expect(st.percent).toBeCloseTo(85);
    expect(st.level).toBe("warning");
    expect(st.crossedThreshold).toBe(80);
    expect(st.remainingCents).toBe(1500);
  });
  it("flags exceeded", () => {
    const st = budgetStatus(budget, [tx({ category_id: "food", amount: "120" })], "2026-10-20");
    expect(st.level).toBe("exceeded");
    expect(st.crossedThreshold).toBe(100);
  });
});

describe("bills & dates", () => {
  it("outstanding and due state", () => {
    expect(outstandingCents({ amount: "100", amount_paid: "40", status: "open" })).toBe(6000);
    expect(outstandingCents({ amount: "100", amount_paid: "0", status: "paid" })).toBe(0);
    expect(billDueState({ due_date: "2026-10-01", status: "open" }, "2026-10-10")).toBe("overdue");
    expect(billDueState({ due_date: "2026-10-12", status: "open" }, "2026-10-10")).toBe("due_soon");
  });
  it("advanceDate clamps month ends", () => {
    expect(advanceDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advanceDate("2026-11-30", "quarterly")).toBe("2027-02-28");
    expect(advanceDate("2026-12-28", "weekly")).toBe("2027-01-04");
    expect(advanceDate("2028-02-29", "yearly")).toBe("2029-02-28");
  });
  it("monthly series", () => {
    const months = lastMonths("2026-02", 3);
    expect(months).toEqual(["2025-12", "2026-01", "2026-02"]);
    const s = monthlySeries([tx({ occurred_on: "2026-01-05", amount: 5 }), tx({ type: "income", occurred_on: "2026-01-09", amount: 20 })], "USD", months);
    expect(s[1]).toEqual({ month: "2026-01", income: 2000, expense: 500, net: 1500 });
  });
});
