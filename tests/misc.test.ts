import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { rulesAnalysis } from "@/lib/ai/email-analysis";
import { transactionSchema, formToObject, intList } from "@/lib/validation";
import { parseTxFilters } from "@/lib/data/transactions";

describe("csv", () => {
  it("escapes and neutralises formulas", () => {
    const csv = toCsv(["a", "b"], [["=SUM(A1)", 'x,"y"'], [-12.5, null]]);
    expect(csv).toBe("a,b\r\n'=SUM(A1),\"x,\"\"y\"\"\"\r\n-12.5,\r\n");
  });
});

describe("rule-based email analysis", () => {
  it("extracts invoice amount and due date", () => {
    const r = rulesAnalysis("Your invoice is ready", "Invoice number INV-88812 for USD 50.00 is due on 2026-11-04. Please pay.");
    const p = r.insights.find((i) => i.kind === "payable")!;
    expect(p.details.amount).toBe(50);
    expect(p.details.currency).toBe("USD");
    expect(p.details.due_date).toBe("2026-11-04");
    expect(p.details.invoice_number).toBe("INV-88812");
    expect(r.method).toBe("rules");
  });
  it("detects meetings and reply requests", () => {
    const r = rulesAnalysis("Kickoff", "Could we meet on 5 November 2026 for a call? Please confirm.");
    expect(r.insights.map((i) => i.kind)).toEqual(expect.arrayContaining(["event", "reply_needed"]));
    expect(r.needs_reply).toBe(true);
  });
  it("never invents amounts", () => {
    const r = rulesAnalysis("Hello", "Just checking in about the project.");
    expect(r.insights.filter((i) => i.kind === "payable")).toHaveLength(0);
  });
});

describe("validation", () => {
  it("validates transactions", () => {
    const ok = transactionSchema.safeParse({ type: "expense", amount: "1,250.50", currency: "zwg", occurred_on: "2026-10-29", description: " Fuel ", business_id: "personal", category_id: "" });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.amount).toBe(1250.5);
      expect(ok.data.currency).toBe("ZWG");
      expect(ok.data.business_id).toBeNull();
      expect(ok.data.description).toBe("Fuel");
    }
    expect(transactionSchema.safeParse({ type: "expense", amount: "0", currency: "USD", occurred_on: "2026-10-29", description: "x" }).success).toBe(false);
    expect(transactionSchema.safeParse({ type: "expense", amount: "1.234", currency: "USD", occurred_on: "2026-10-29", description: "x" }).success).toBe(false);
  });
  it("parses repeated form fields", () => {
    const fd = new FormData();
    fd.append("reminder_offsets[]", "15");
    fd.append("reminder_offsets[]", "60");
    fd.append("title", "x");
    const o = formToObject(fd);
    expect(o).toEqual({ reminder_offsets: ["15", "60"], title: "x" });
    expect(intList.parse(o.reminder_offsets)).toEqual([60, 15]);
  });
  it("sanitises transaction filters", () => {
    expect(parseTxFilters({ type: "bogus", from: "2026-01-01", page: "x", currency: "USD" })).toMatchObject({ type: undefined, from: "2026-01-01", currency: "USD" });
  });
});
