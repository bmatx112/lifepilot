import { Suspense } from "react";
import { PageHeader } from "@/components/ui/misc";
import { PathTabs } from "@/components/ui/path-tabs";

const TABS = [
  { href: "/finance", label: "Overview" },
  { href: "/finance/transactions", label: "Transactions" },
  { href: "/finance/budgets", label: "Budgets" },
  { href: "/finance/bills", label: "Bills & receivables" },
  { href: "/finance/recurring", label: "Recurring" },
  { href: "/finance/categories", label: "Categories" },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Personal Finance" description="Income, expenses, budgets and obligations. Business records stay separate unless you choose a consolidated view." />
      <Suspense><PathTabs tabs={TABS} keep={["scope"]} /></Suspense>
      {children}
    </>
  );
}
