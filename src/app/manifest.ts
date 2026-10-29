import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LifePilot AI",
    short_name: "LifePilot",
    description: "Personal & business assistant: finances, tasks, calendar, email and reminders.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0b2545",
    theme_color: "#0b2545",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add expense", url: "/finance/transactions?new=expense" },
      { name: "Tasks", url: "/tasks" },
      { name: "Calendar", url: "/calendar" },
    ],
  };
}
