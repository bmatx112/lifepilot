"use client";
import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";
const EVENT = "lifepilot-theme";

function readTheme(): Theme {
  try {
    return (localStorage.getItem("theme") as Theme) ?? "system";
  } catch {
    return "system";
  }
}

function apply(t: Theme) {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => readTheme() === "system" && apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const choose = (t: Theme) => {
    try {
      localStorage.setItem("theme", t);
    } catch {}
    apply(t);
    window.dispatchEvent(new Event(EVENT));
  };
  const opts: { t: Theme; icon: React.ReactNode; label: string }[] = [
    { t: "light", icon: <Sun />, label: "Light" },
    { t: "dark", icon: <Moon />, label: "Dark" },
    { t: "system", icon: <Monitor />, label: "System" },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded-lg border border-border bg-card p-0.5", className)}>
      {opts.map((o) => (
        <button
          key={o.t}
          role="radio"
          aria-checked={theme === o.t}
          title={o.label}
          onClick={() => choose(o.t)}
          className={cn("rounded-md p-1.5 text-muted-foreground [&_svg]:size-3.5", theme === o.t && "bg-muted text-foreground")}
        >
          {o.icon}
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
