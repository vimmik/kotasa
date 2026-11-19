"use client";

import { useState } from "react";
import { ArrowSquareOut, CheckCircle } from "@phosphor-icons/react/ssr";
import { BRAND } from "@/lib/brand";

type App = { id: string; name: string; href: (url: string) => string; tip: string };

// Where each AI app adds a custom MCP connector. None of them has an official "add this connector"
// link yet, so each button copies our link and opens the right place; the person pastes it.
// Claude's prefilled-dialog link isn't documented: if Claude ignores the extra parts, it still opens
// its Connectors page. Swap these for real one-click links once Kotasa is listed in their directories.
const APPS: App[] = [
  {
    id: "claude",
    name: "Claude",
    href: (url) =>
      `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(BRAND.name)}&connectorUrl=${encodeURIComponent(url)}`,
    tip: "In Claude, add a custom connector, paste the link if it isn't filled in, then press Connect and allow it.",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    href: () => "https://chatgpt.com/#settings/Connectors",
    tip: "In ChatGPT's settings, turn on Developer mode (under Advanced), create a connector, paste the link and allow it. Needs a paid plan for now.",
  },
  {
    id: "gemini",
    name: "Gemini",
    href: () => "https://gemini.google.com/",
    tip: "In Gemini, open Settings › Connected apps, add a custom app, paste the link and allow it. Not open in every country yet.",
  },
];

/** "Connect to Claude / ChatGPT / Gemini": copies the connector link and opens that app. */
export function AiConnectButtons({ url }: { url: string }) {
  const [picked, setPicked] = useState<{ app: App; copied: boolean } | null>(null);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {APPS.map((app) => (
          <a
            key={app.id}
            href={app.href(url)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost min-w-0 gap-1 px-1.5"
            onClick={() => {
              // Copy while this tab still has focus; the link then opens the app in a new tab.
              setPicked({ app, copied: false });
              navigator.clipboard?.writeText(url).then(
                () => setPicked({ app, copied: true }),
                () => setPicked({ app, copied: false }),
              );
            }}
          >
            {app.name} <ArrowSquareOut size={14} className="shrink-0" aria-hidden="true" />
          </a>
        ))}
      </div>
      {picked && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-strong">
          <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {picked.copied ? "Link copied. " : "Copy the link below first. "}
            {picked.app.tip}
          </span>
        </p>
      )}
    </div>
  );
}
