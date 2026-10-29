"use client";
import { useEffect, useState } from "react";
import { BellOff, BellRing, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { useLookups } from "@/components/layout/lookups";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "server-off";

/** Lets the user enable/disable Web Push on this device, with honest explanations. */
export function PushSettings() {
  const { vapidPublicKey, features } = useLookups();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!features.push || !vapidPublicKey) return setState("server-off");
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState(isIOS && !standalone ? "ios-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [features.push, vapidPublicKey]);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not register this device");
      setState("on");
      toast.success("Push notifications enabled on this device");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
      toast.success("Push notifications disabled on this device");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    const res = await fetch("/api/push/test", { method: "POST" });
    const json = await res.json();
    setBusy(false);
    if (res.ok) toast.success("Test notification sent — it should appear in a few seconds");
    else toast.error(json.error);
  };

  if (state === "loading") return <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline size-4 animate-spin" />Checking this device…</p>;
  if (state === "server-off")
    return <Alert tone="warning" title="Push notifications are not configured on the server">Generate VAPID keys and set <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> and <code>VAPID_PRIVATE_KEY</code> (see README). In-app notifications still work.</Alert>;
  if (state === "ios-install")
    return <Alert tone="info" title="Install the app first" icon={<Smartphone />}>On iPhone/iPad, push requires iOS 16.4+ and the app installed to the Home Screen: tap Share → “Add to Home Screen”, open LifePilot from there, then enable notifications.</Alert>;
  if (state === "unsupported") return <Alert tone="warning" title="This browser doesn&apos;t support push notifications">You&apos;ll still get in-app notifications{features.emailReminders ? " and email reminders" : ""}.</Alert>;
  if (state === "denied") return <Alert tone="danger" title="Notifications are blocked" icon={<BellOff />}>You blocked notifications for this site. Re-enable them in your browser&apos;s site settings, then reload this page.</Alert>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "on" ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-sm text-success"><BellRing className="size-4" /> Enabled on this device</span>
          <Button size="sm" variant="outline" onClick={test} disabled={busy}>Send test</Button>
          <Button size="sm" variant="ghost" onClick={disable} disabled={busy}>Disable</Button>
        </>
      ) : (
        <Button size="sm" variant="accent" onClick={enable} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <BellRing />} Enable push on this device</Button>
      )}
    </div>
  );
}
