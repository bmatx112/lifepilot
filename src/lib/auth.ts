import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** Returns the authenticated user, their profile and an RLS-scoped client, or redirects to /login. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
  return {
    supabase,
    user: data.user,
    profile: (profile ?? {
      id: data.user.id,
      full_name: data.user.email,
      timezone: "UTC",
      default_currency: "USD",
      onboarded: false,
    }) as Profile,
  };
});

/** For route handlers: returns null instead of redirecting. */
export async function getApiUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
  return { supabase, user: data.user, profile: profile as Profile };
}
