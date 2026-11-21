"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Check, Copy, LoaderCircle } from "lucide-react";
import type { FormAction, ActionState } from "@/lib/action-state";
import { Button } from "./button";

export function Feedback({ state }: { state: ActionState }) {
  return <>
    {state.error && <p role="alert" className="notice error">{state.error}</p>}
    {state.success && <p role="status" className="notice success">{state.success}</p>}
  </>;
}

export function ActionForm({ action, submit, pendingLabel = "Saving…", variant = "primary", children, disabled, value, className }:
  { action: FormAction; submit: ReactNode; pendingLabel?: string; variant?: "primary" | "secondary" | "danger" | "ghost";
    children?: ReactNode; disabled?: boolean; value?: string; className?: string }) {
  const [state, dispatch, pending] = useActionState(action, {});
  return <form action={dispatch} className={className}>
    {children}
    <Feedback state={state} />
    <Button type="submit" variant={variant} disabled={pending || disabled} name={value ? "response" : undefined} value={value}>
      {pending ? <><LoaderCircle size={16} className="spin" />{pendingLabel}</> : submit}
    </Button>
  </form>;
}

export function CopyButton({ path, label }: { path: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState("");
  async function copy() {
    const origin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const link = new URL(path, origin).href;
    try {
      await navigator.clipboard.writeText(link);
      setFallback("");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setFallback(link);
    }
  }
  return <div className="copy-control">
    <Button size="small" variant="secondary" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}
      <span aria-live="polite">{copied ? "Link copied" : label}</span>
    </Button>
    {fallback && <input aria-label="Shareable link" readOnly value={fallback} onFocus={(event) => event.target.select()} />}
  </div>;
}
