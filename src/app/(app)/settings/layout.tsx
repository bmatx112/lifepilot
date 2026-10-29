import { Suspense } from "react";
import { PageHeader } from "@/components/ui/misc";
import { PathTabs } from "@/components/ui/path-tabs";

const TABS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/data", label: "Data & privacy" },
  { href: "/settings/activity", label: "Activity log" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" />
      <Suspense><PathTabs tabs={TABS} /></Suspense>
      <div className="max-w-3xl">{children}</div>
    </>
  );
}
