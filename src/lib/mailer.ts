import "server-only";
import { env, features } from "@/lib/env";

/** Sends a transactional reminder email via Resend (https://resend.com). */
export async function sendReminderEmail(to: string, subject: string, text: string, url?: string | null) {
  if (!features.emailReminders()) return { sent: false, reason: "email_not_configured" };
  const link = url ? `${env.appUrl()}${url}` : env.appUrl();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.emailFrom(),
      to: [to],
      subject,
      text: `${text}\n\nOpen LifePilot: ${link}\n\nYou can change reminder settings in Settings → Notifications.`,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  return { sent: true };
}
