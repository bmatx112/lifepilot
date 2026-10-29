"use client";
import { createContext, useContext } from "react";
import type { Business, Category, Contact, EmailAccount, Project } from "@/lib/types";
import type { FeatureStatus } from "@/lib/env";

export interface Lookups {
  userId: string;
  email: string;
  name: string;
  timezone: string;
  currency: string;
  businesses: Business[];
  categories: Category[];
  projects: Project[];
  contacts: Contact[];
  calendarAccounts: Pick<EmailAccount, "id" | "provider" | "email_address">[];
  defaultTaskReminders: number[];
  defaultEventReminders: number[];
  features: FeatureStatus;
  vapidPublicKey: string | null;
}

const Ctx = createContext<Lookups | null>(null);

export function LookupsProvider({ value, children }: { value: Lookups; children: React.ReactNode }) {
  return <Ctx value={value}>{children}</Ctx>;
}

export function useLookups(): Lookups {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLookups must be used inside the app shell");
  return v;
}
