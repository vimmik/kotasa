import { ArrowDownLeft, Car, ChatText } from "@phosphor-icons/react/ssr";
import { BRAND } from "@/lib/brand";
import { DevelopedBy, LogoMark } from "@/components/brand";
import { Avatar } from "@/components/bits";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tilt } from "@/components/tilt";

// Glass without backdrop blur: blur flattens 3D transforms, and these cards float in 3D.
const PLATE =
  "rounded-2xl p-4 [background:var(--glass)] shadow-[inset_0_1px_0_var(--edge-hi),0_0_0_1px_var(--glass-line),var(--deep-shadow)]";

/** Three sample cards floating in 3D: what the app does, at a glance. Desktop only. */
function Showcase() {
  return (
    <Tilt className="mt-14 hidden h-[300px] w-full max-w-[520px] lg:block" max={9}>
      <div className={`float-card absolute top-10 left-0 w-[300px] -rotate-[4deg] [transform:translateZ(30px)] ${PLATE}`} style={{ "--dur": "7s" } as React.CSSProperties}>
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-surface-2 text-muted">
            <Car size={18} weight="duotone" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Uber to Liberty Plaza</p>
            <p className="text-xs text-muted">You paid · split 3 ways</p>
          </div>
          <span className="text-sm font-semibold tabular-nums">Rs. 1,260</span>
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
          {["Dilan Fernando", "Sachini Perera", "Ishara Silva"].map((n) => (
            <Avatar key={n} name={n} size={26} />
          ))}
          <span className="ml-auto text-xs text-muted tabular-nums">Rs. 420 each</span>
        </div>
      </div>

      <div
        className={`float-card absolute top-0 right-2 w-[230px] rotate-[3deg] [transform:translateZ(80px)] ${PLATE}`}
        style={{ "--dur": "6s", "--delay": "-2s" } as React.CSSProperties}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
            <ArrowDownLeft size={16} weight="bold" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Sachini paid you</p>
            <p className="text-xs text-muted">Bank transfer</p>
          </div>
        </div>
        <p className="mt-2 text-right text-lg font-semibold text-brand tabular-nums">+Rs. 420</p>
      </div>

      <div
        className={`float-card absolute right-10 bottom-0 w-[290px] rotate-[1.5deg] [transform:translateZ(50px)] ${PLATE}`}
        style={{ "--dur": "8s", "--delay": "-5s" } as React.CSSProperties}
      >
        <div className="flex items-center gap-2 text-xs text-muted">
          <ChatText size={14} aria-hidden="true" /> Friday SMS
        </div>
        <p className="mt-1.5 text-sm leading-snug">
          {BRAND.name}: your total this week is <span className="font-semibold tabular-nums">Rs. 2,385</span>. See the
          details at <span className="text-brand">kotasa.app/b/…</span>
        </p>
      </div>
    </Tilt>
  );
}

/** Split layout for the logged-out screens: story on the left, glass card with the form on the right. */
export function AuthShell({
  title,
  sub,
  children,
  footer,
}: {
  title: string;
  sub?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-8 lg:px-10">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <LogoMark size={34} />
          <span className="text-[1.15rem] font-bold tracking-tight">{BRAND.name.toLowerCase()}</span>
        </span>
        <ThemeToggle compact />
      </header>

      <div className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <section className="stagger">
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-brand-strong uppercase">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
            Office expenses, settled weekly
          </p>
          <h1 className="mt-5 text-[2.75rem] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-6xl lg:text-7xl">
            Share it.
            <br />
            <span className="bg-linear-to-r from-brand via-brand to-amber bg-clip-text text-transparent">Settle it.</span>
          </h1>
          <p className="mt-5 max-w-md text-muted">
            Breakfast orders, a ride to a client, the birthday cake. Anyone pays, {BRAND.name} keeps track, and everyone
            gets one clear total on Friday.
          </p>
          <Showcase />
        </section>

        <section className="w-full max-w-md lg:justify-self-end">
          <div className="bezel">
            <div className="glass rounded-[calc(2rem-0.375rem)] p-6 sm:p-8">
              <h2 className="text-xl font-semibold">{title}</h2>
              {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
              <div className="mt-6">{children}</div>
            </div>
          </div>
          {footer && <div className="mt-6 text-center text-xs text-muted">{footer}</div>}
        </section>
      </div>
      <DevelopedBy />
    </main>
  );
}
