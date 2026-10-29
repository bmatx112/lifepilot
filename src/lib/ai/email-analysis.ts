import "server-only";
import { chatCompletion } from "@/lib/ai/openai";
import { features } from "@/lib/env";
import type { InsightKind } from "@/lib/types";

export interface ExtractedInsight {
  kind: InsightKind;
  title: string;
  details: {
    due_date: string | null;
    due_time: string | null;
    start: string | null;
    end: string | null;
    location: string | null;
    amount: number | null;
    currency: string | null;
    invoice_number: string | null;
    counterparty: string | null;
    evidence: string;
  };
  confidence: number;
}

export interface EmailAnalysis {
  summary: string;
  needs_reply: boolean;
  insights: ExtractedInsight[];
  method: "ai" | "rules";
}

const nullable = (type: string) => ({ type: [type, "null"] });

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "needs_reply", "insights"],
  properties: {
    summary: { type: "string" },
    needs_reply: { type: "boolean" },
    insights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "details", "confidence"],
        properties: {
          kind: { type: "string", enum: ["task", "event", "payable", "receivable", "deadline", "follow_up", "reply_needed"] },
          title: { type: "string" },
          confidence: { type: "number" },
          details: {
            type: "object",
            additionalProperties: false,
            required: ["due_date", "due_time", "start", "end", "location", "amount", "currency", "invoice_number", "counterparty", "evidence"],
            properties: {
              due_date: { ...nullable("string"), description: "yyyy-MM-dd" },
              due_time: { ...nullable("string"), description: "HH:mm" },
              start: { ...nullable("string"), description: "yyyy-MM-ddTHH:mm local" },
              end: { ...nullable("string"), description: "yyyy-MM-ddTHH:mm local" },
              location: nullable("string"),
              amount: nullable("number"),
              currency: { ...nullable("string"), description: "ISO code e.g. USD, ZWG" },
              invoice_number: nullable("string"),
              counterparty: nullable("string"),
              evidence: { type: "string", description: "Short exact quote from the email supporting this item" },
            },
          },
        },
      },
    },
  },
};

/**
 * Extracts a summary and structured suggestions from an email. Results are
 * stored as *suggestions* that the user must review before any record is
 * created. Uses AI when configured, otherwise conservative pattern matching.
 */
export async function analyzeEmail(input: { subject: string; from: string | null; receivedAt: string; body: string; today: string; tz: string }): Promise<EmailAnalysis> {
  const body = input.body.slice(0, 12_000);
  if (features.ai()) {
    const { message } = await chatCompletion({
      messages: [
        {
          role: "system",
          content:
            `Analyse the email for a busy professional. Today is ${input.today} (${input.tz}). ` +
            "Return: a 1-3 sentence summary; whether it needs a reply from the recipient; and actionable items: " +
            "tasks/commitments the recipient promised or was asked to do, meetings (event) with times, invoices/bills to pay (payable), " +
            "money owed to the recipient (receivable), deadlines, follow-ups. Only extract what is explicitly stated — quote evidence. " +
            "Resolve relative dates against the email's received date. Use null for unknown fields. Never guess amounts.",
        },
        { role: "user", content: `Subject: ${input.subject}\nFrom: ${input.from ?? "unknown"}\nReceived: ${input.receivedAt}\n\n${body}` },
      ],
      json: { name: "email_analysis", schema: SCHEMA },
      maxTokens: 1200,
      temperature: 0,
    });
    const parsed = JSON.parse(message.content ?? "{}");
    return { ...parsed, insights: (parsed.insights ?? []).slice(0, 10), method: "ai" };
  }
  return rulesAnalysis(input.subject, body);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Conservative fallback: finds explicit amounts, dates, invoice numbers and meeting cues. */
export function rulesAnalysis(subject: string, body: string): EmailAnalysis {
  const text = `${subject}\n${body}`;
  const insights: ExtractedInsight[] = [];
  const amountMatch = text.match(/\b(USD|US\$|ZWG|ZAR|EUR|GBP|\$|R)\s?([0-9]{1,3}(?:[ ,][0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/i);
  const isoDate = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const longDate = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(20\d{2})\b/i);
  let date: string | null = null;
  if (isoDate) date = `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  else if (longDate) date = `${longDate[3]}-${String(MONTHS.indexOf(longDate[2].toLowerCase()) + 1).padStart(2, "0")}-${longDate[1].padStart(2, "0")}`;
  const invoice = text.match(/\binvoice\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9-]{3,})/i);
  const cur = amountMatch ? amountMatch[1].toUpperCase().replace("US$", "USD").replace("$", "USD").replace(/^R$/, "ZAR") : null;
  const amount = amountMatch ? Number(amountMatch[2].replace(/[ ,]/g, "")) : null;
  const base = { due_time: null, start: null, end: null, location: null, invoice_number: invoice?.[1] ?? null, counterparty: null };

  if (/\b(invoice|payment due|amount due|please pay|bill)\b/i.test(text) && amount) {
    insights.push({ kind: "payable", title: `Pay ${subject}`.slice(0, 200), confidence: 0.5, details: { ...base, due_date: date, amount, currency: cur, evidence: amountMatch![0] } });
  }
  if (/\b(meeting|call|appointment|interview|zoom|teams|google meet)\b/i.test(text) && date) {
    insights.push({ kind: "event", title: subject.slice(0, 200), confidence: 0.4, details: { ...base, due_date: date, amount: null, currency: null, evidence: (longDate ?? isoDate)![0] } });
  }
  if (/\b(deadline|due by|no later than|by end of)\b/i.test(text) && date) {
    insights.push({ kind: "deadline", title: `Deadline: ${subject}`.slice(0, 200), confidence: 0.4, details: { ...base, due_date: date, amount: null, currency: null, evidence: (longDate ?? isoDate)![0] } });
  }
  const needsReply = /\?\s|\b(please (confirm|let me know|advise|reply)|could you|can you|kindly)\b/i.test(text);
  if (needsReply) insights.push({ kind: "reply_needed", title: `Reply to: ${subject}`.slice(0, 200), confidence: 0.4, details: { ...base, due_date: null, amount: null, currency: null, evidence: "Contains a question or request" } });
  const firstSentences = body.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/).slice(0, 2).join(" ");
  return { summary: firstSentences.slice(0, 400) || subject, needs_reply: needsReply, insights, method: "rules" };
}
