import { z } from "zod";

export type Scope = { mode: "personal" } | { mode: "all" } | { mode: "business"; id: string };

export function parseScope(v: unknown, fallback: Scope["mode"] = "personal"): Scope {
  if (v === "all") return { mode: "all" };
  if (v === "personal") return { mode: "personal" };
  if (typeof v === "string" && z.uuid().safeParse(v).success) return { mode: "business", id: v };
  return fallback === "all" ? { mode: "all" } : { mode: "personal" };
}

export function applyScope<Q>(q: Q, s: Scope): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = q as any;
  if (s.mode === "personal") return f.is("business_id", null);
  if (s.mode === "business") return f.eq("business_id", s.id);
  return q;
}

export function scopeParam(s: Scope) {
  return s.mode === "business" ? s.id : s.mode;
}
