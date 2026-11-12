"use client";

import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react/ssr";

/**
 * Hands a ready-written message to the phone's share sheet (WhatsApp, SMS, anything). Where there
 * is no share sheet (most desktops) it opens WhatsApp with the message typed in. The sender picks
 * who it goes to, so the app never has to show one member another member's number.
 */
export function ShareButton({
  text,
  children,
  className = "btn-ghost",
  label,
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
  /** for icon-only buttons */
  label?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      onClick={async () => {
        if (typeof navigator !== "undefined" && navigator.share) {
          try {
            await navigator.share({ text });
          } catch {
            /* closed the share sheet */
          }
          return;
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      }}
    >
      {children}
    </button>
  );
}

/** The account number inside bank details ("BOC 8012345678, K Dinajara" -> "8012345678"), if there is one. */
export function accountNumber(details: string): string | null {
  const runs = details.match(/\d[\d\s-]{4,}\d/g)?.map((r) => r.replace(/\D/g, "")).filter((r) => r.length >= 6) ?? [];
  return runs.sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * Someone's bank details with a copy button. It copies just the account number when there is one,
 * because that's what a banking app wants pasted; otherwise the whole line.
 */
export function PayTo({ details, prefix = "Pay to:", className = "" }: { details: string; prefix?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const number = accountNumber(details);
  return (
    <span className={`flex items-start gap-1.5 text-xs text-muted ${className}`}>
      <span className="min-w-0 break-words">
        {prefix} <span className="font-medium text-ink">{details}</span>
      </span>
      <button
        type="button"
        className="-my-1 inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 font-semibold text-brand hover:bg-brand-soft"
        aria-label={number ? `Copy account number ${number}` : "Copy bank details"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(number ?? details);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked */
          }
        }}
      >
        {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
        {copied ? "Copied" : number ? "Copy no." : "Copy"}
      </button>
    </span>
  );
}
