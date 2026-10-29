import { requireUser } from "@/lib/auth";
import { env, featureStatus } from "@/lib/env";
import { PROVIDERS } from "@/lib/integrations/providers";
import { IntegrationsView } from "@/components/settings/integrations-view";
import type { EmailAccount } from "@/lib/types";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage({ searchParams }: PageProps<"/settings/integrations">) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("email_accounts").select("*").eq("user_id", user.id).order("created_at");
  return (
    <IntegrationsView
      accounts={(data ?? []) as EmailAccount[]}
      features={featureStatus()}
      appUrl={env.appUrl()}
      scopes={{ google: [...PROVIDERS.google.scopes], microsoft: [...PROVIDERS.microsoft.scopes] }}
      connected={typeof sp.connected === "string" ? sp.connected : null}
      error={typeof sp.error === "string" ? sp.error : null}
    />
  );
}
