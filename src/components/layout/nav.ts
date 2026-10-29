import { Bell, Briefcase, CalendarDays, ChartColumn, LayoutDashboard, Mail, Settings, Sparkles, SquareCheckBig, Wallet } from "lucide-react";

export const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/finance", label: "Personal Finance", short: "Finance", icon: Wallet },
  { href: "/business", label: "Business", icon: Briefcase },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: SquareCheckBig },
  { href: "/email", label: "Email", icon: Mail },
  { href: "/assistant", label: "AI Assistant", short: "Assistant", icon: Sparkles },
  { href: "/reports", label: "Reports", icon: ChartColumn },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export const MOBILE_PRIMARY = ["/dashboard", "/finance", "/tasks", "/calendar"];
