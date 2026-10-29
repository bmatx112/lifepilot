import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncate(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export const PRIORITY_LABEL = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" } as const;
export const STATUS_LABEL = { pending: "Pending", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" } as const;
