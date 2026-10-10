"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "system" | "light" | "dark";
const OPTIONS: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: "system", label: "System", Icon: Monitor },
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
];

function apply(t: Theme) {
  const root = document.documentElement;
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
  try {
    if (t === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", t);
  } catch {
    /* storage blocked */
  }
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with the pre-paint script
    if (t === "light" || t === "dark") setTheme(t);
  }, []);

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-xl border border-line bg-surface-2 p-0.5">
      {OPTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={theme === id}
          title={label}
          onClick={() => {
            setTheme(id);
            apply(id);
          }}
          className={`flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-semibold transition ${theme === id ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-muted hover:text-ink"}`}
        >
          <Icon size={14} aria-hidden="true" />
          {!compact && label}
        </button>
      ))}
    </div>
  );
}
