import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-muted text-muted-foreground",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-destructive-soft text-destructive",
  info: "bg-info-soft text-info",
  outline: "border border-border text-muted-foreground",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap", tones[tone], className)} {...props} />;
}

export function priorityTone(p: string): BadgeTone {
  return p === "urgent" ? "danger" : p === "high" ? "warning" : p === "medium" ? "info" : "neutral";
}

export function statusTone(s: string): BadgeTone {
  return s === "completed" || s === "paid" || s === "executed" || s === "connected" ? "success"
    : s === "in_progress" || s === "proposed" ? "info"
    : s === "cancelled" || s === "rejected" ? "neutral"
    : s === "overdue" || s === "failed" || s === "error" ? "danger"
    : s === "due_soon" ? "warning" : "outline";
}
