"use client";
import * as React from "react";
import { startTransition, useActionState, useEffect, useRef, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/types";

export type FormAction = (prev: ActionResult<unknown> | null, formData: FormData) => Promise<ActionResult<unknown>>;

/**
 * Wraps a server action for a <form>, toasting the outcome.
 * Submits via onSubmit + transition instead of the `action` prop, because React
 * resets uncontrolled fields after an `action` submission — which would wipe the
 * user's input when the server rejects it (validation errors, conflicts).
 */
export function useFormAction(action: FormAction, opts?: { onSuccess?: (r: ActionResult<unknown>) => void; silent?: boolean }) {
  const [state, dispatch, pending] = useActionState(action, null);
  const formAction = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  const onSuccess = useRef(opts?.onSuccess);
  useEffect(() => {
    onSuccess.current = opts?.onSuccess;
  });
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      if (!opts?.silent) toast.success(state.message ?? "Saved");
      state.warnings?.forEach((w) => toast.warning(w, { duration: 8000 }));
      onSuccess.current?.(state);
    } else {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const fieldErrors = state && !state.ok ? state.fieldErrors ?? {} : {};
  return { state, formAction, pending, fieldErrors };
}

export function SubmitButton({ children, pendingText, pending: pendingProp, ...props }: ButtonProps & { pendingText?: string; pending?: boolean }) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button type="submit" {...props} disabled={pending || props.disabled}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

/**
 * Button that runs a server action (optionally after confirmation) and toasts
 * the result. Used for deletes, status changes and other one-click mutations.
 */
export function ActionButton({
  action,
  confirm,
  confirmLabel = "Confirm",
  children,
  onDone,
  ...props
}: Omit<ButtonProps, "onClick" | "action"> & {
  action: () => Promise<ActionResult<unknown>>;
  confirm?: { title: string; description?: string };
  confirmLabel?: string;
  onDone?: (r: ActionResult<unknown>) => void;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = React.useState(false);
  const run = () =>
    start(async () => {
      try {
        const r = await action();
        if (r.ok) {
          toast.success(r.message ?? "Done");
          r.warnings?.forEach((w) => toast.warning(w, { duration: 8000 }));
        } else toast.error(r.error);
        setOpen(false);
        onDone?.(r);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  return (
    <>
      <Button {...props} disabled={pending || props.disabled} onClick={() => (confirm ? setOpen(true) : run())}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {children}
      </Button>
      {confirm ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent title={confirm.title} description={confirm.description}>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant={props.variant === "destructive" ? "destructive" : "default"} onClick={run} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {confirmLabel}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
