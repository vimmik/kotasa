"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { signInWithGoogleToken } from "@/app/actions/auth";
import { FormMessage } from "@/components/ui";
import type { ActionState } from "@/lib/types";

type Gis = {
  accounts: {
    id: {
      initialize: (o: Record<string, unknown>) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    };
  };
};
declare global {
  interface Window {
    google?: Gis;
  }
}

const SRC = "https://accounts.google.com/gsi/client";
let loading: Promise<Gis> | null = null;

/** Loads Google Identity Services once per page. */
function loadGis(): Promise<Gis> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => (window.google ? resolve(window.google) : reject(new Error("no gis")));
    s.onerror = () => {
      loading = null;
      reject(new Error("gis blocked"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Google's own button, rendered on our page, so the consent screen names our domain instead of
 * Supabase's. The ID token goes to signInWithGoogleToken. If Google's script can't load
 * (blocked, offline), `fallback` (the redirect button) is shown instead.
 */
export function GoogleSignIn({
  clientId,
  intent,
  next = "/start",
  text = "continue_with",
  fallback,
}: {
  clientId: string;
  intent: "login" | "connect";
  next?: string;
  text?: "continue_with" | "signup_with" | "signin_with";
  fallback: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const gis = await loadGis();
        const raw = crypto.randomUUID() + crypto.randomUUID();
        const nonce = await sha256Hex(raw);
        if (!alive || !box.current) return;
        gis.accounts.id.initialize({
          client_id: clientId,
          nonce,
          ux_mode: "popup",
          context: text === "signup_with" ? "signup" : "signin",
          itp_support: true,
          callback: ({ credential }: { credential: string }) =>
            start(async () => {
              setState(null);
              const res = await signInWithGoogleToken(credential, raw, intent, next);
              if (res) setState(res);
            }),
        });
        const dark =
          document.documentElement.dataset.theme === "dark" ||
          (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
        gis.accounts.id.renderButton(box.current, {
          type: "standard",
          theme: dark ? "filled_black" : "outline",
          size: "large",
          shape: "pill",
          text,
          logo_alignment: "center",
          locale: "en", // the rest of the app is in English
          width: Math.min(400, Math.max(200, Math.round(box.current.clientWidth))),
        });
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [clientId, intent, next, text]);

  if (failed) return <>{fallback}</>;
  return (
    <div className="space-y-2">
      <div ref={box} className={`flex min-h-11 justify-center transition-opacity ${pending ? "pointer-events-none opacity-50" : ""}`} />
      {pending && (
        <p className="text-center text-xs text-muted" role="status">
          Signing you in…
        </p>
      )}
      <FormMessage state={state} />
    </div>
  );
}
