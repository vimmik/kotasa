import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Car,
  ChatText,
  ForkKnife,
  Lightning,
  LockSimple,
  Receipt,
  Scales,
  Sparkle,
  UsersThree,
  Wallet,
} from "@phosphor-icons/react/ssr";
import { BRAND } from "@/lib/brand";
import { DevelopedBy, Logo } from "@/components/brand";
import { Avatar } from "@/components/bits";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} — ${BRAND.tagline}` },
  description: "Split shared costs with any group, and see how much you can safely spend today.",
};

// "/" for logged-out visitors. Logged-in people never see it: src/proxy.ts sends them to /me.
export default function Landing() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-10 sm:px-6 lg:px-10">
      <header className="flex h-16 items-center justify-between gap-3">
        <Logo href="/" size={32} />
        <nav className="flex items-center gap-2" aria-label="Account">
          <ThemeToggle compact />
          <Link href="/login" className="btn-ghost">
            Log in
          </Link>
          <Link href="/signup" className="btn-primary hidden sm:inline-flex">
            Get started
          </Link>
        </nav>
      </header>

      <main className="space-y-24 sm:space-y-32">
        <Hero />
        <TwoSides />
        <HowItWorks />
        <ForAnyGroup />
        <FinalCall />
      </main>

      <footer className="mt-20 border-t border-line pt-8">
        <DevelopedBy />
      </footer>
    </div>
  );
}

function Hero() {
  return (
    <section className="grid items-center gap-12 pt-8 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pt-16">
      <div className="stagger">
        <p className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-brand-strong uppercase">
          <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
          For offices, friends, trips and family
        </p>
        <h1 className="mt-5 text-[2.9rem] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-6xl lg:text-7xl">
          Share it.
          <br />
          <span className="bg-linear-to-r from-brand via-brand to-amber bg-clip-text text-transparent">Settle it.</span>
        </h1>
        <p className="mt-6 max-w-lg text-lg text-muted">
          Split lunches, rides and trips with any group. Anyone pays, {BRAND.name} keeps track of who owes whom. Your
          share lands in your own budget, so each morning you know how much you can safely spend.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className="btn-primary group min-h-12 justify-between rounded-full py-1.5 pr-1.5 pl-6 text-[15px] sm:min-w-56">
            <span>Get started</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-white/20 transition-transform duration-300 ease-(--ease-out-soft) group-hover:translate-x-0.5">
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </span>
          </Link>
          <Link href="/login" className="btn-ghost min-h-12 rounded-full px-6">
            I have an account
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted">Sign up with Google. Works in your browser, nothing to install.</p>
      </div>

      <PhonePreview />
    </section>
  );
}

/** A still picture of the Me screen: what you get the moment you sign up. */
function PhonePreview() {
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
      <div className="absolute inset-0 rounded-[3rem] bg-brand-soft opacity-60 blur-3xl" />
      <div className="bezel relative">
        <div className="space-y-4 rounded-[calc(2rem-0.375rem)] bg-surface p-5">
          <div>
            <p className="text-sm text-muted">Hi Sachini</p>
            <p className="mt-3 text-sm font-medium">Safe to spend today</p>
            <p className="text-4xl font-semibold tracking-[-0.03em] text-brand tabular-nums">Rs. 1,240</p>
            <p className="mt-1 text-xs text-muted">Rs. 22,300 left for 18 days · Monthly spending</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full w-[58%] rounded-full bg-brand" />
          </div>
          <div className="rounded-2xl border border-line bg-bg px-3 py-2.5 text-sm text-muted">
            <span className="text-ink">lunch 450</span>
            <span className="ml-1 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-ink" />
          </div>
          <ul className="divide-y divide-line">
            {[
              { icon: ForkKnife, title: "Lunch", sub: "Office · your share", amount: "Rs. 450" },
              { icon: Car, title: "Uber to Liberty Plaza", sub: "Office · split 3 ways", amount: "Rs. 420" },
              { icon: Lightning, title: "Electricity bill", sub: "Bills", amount: "Rs. 3,850" },
            ].map((r) => (
              <li key={r.title} className="flex items-center gap-3 py-2.5">
                <span className="inline-flex size-9 items-center justify-center rounded-xl bg-surface-2 text-muted">
                  <r.icon size={16} weight="duotone" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  <span className="text-xs text-muted">{r.sub}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{r.amount}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function TwoSides() {
  return (
    <section aria-labelledby="two-sides">
      <h2 id="two-sides" className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
        One app for the money you share and the money you keep.
      </h2>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <article className="card p-6 sm:p-8">
          <span className="inline-flex size-11 items-center justify-center rounded-[32%] bg-brand-soft text-brand-strong">
            <UsersThree size={22} weight="duotone" aria-hidden="true" />
          </span>
          <h3 className="mt-5 text-xl font-semibold">Groups</h3>
          <p className="mt-2 text-muted">For the office, friends, a trip or the family.</p>
          <ul className="mt-5 space-y-3 text-sm">
            <Point icon={Receipt}>Anyone pays. Split equally or by custom amounts.</Point>
            <Point icon={Scales}>Kotasa keeps a running balance of who owes whom, and unpaid amounts carry forward.</Point>
            <Point icon={ForkKnife}>Daily meal orders with a cutoff time, for offices that order lunch together.</Point>
            <Point icon={ChatText}>A weekly SMS with each person&apos;s total, even for people who never install anything.</Point>
          </ul>
        </article>
        <article className="card p-6 sm:p-8">
          <span className="inline-flex size-11 items-center justify-center rounded-[32%] bg-amber-soft text-amber-ink">
            <Wallet size={22} weight="duotone" aria-hidden="true" />
          </span>
          <h3 className="mt-5 text-xl font-semibold">Me</h3>
          <p className="mt-2 text-muted">Your own budget, private to you.</p>
          <ul className="mt-5 space-y-3 text-sm">
            <Point icon={Sparkle}>&ldquo;Safe to spend today&rdquo;, worked out from your budget and what&apos;s left.</Point>
            <Point icon={Lightning}>Type &ldquo;uber 1,200 yesterday&rdquo; and it&apos;s saved, category and all.</Point>
            <Point icon={UsersThree}>Your share of every group expense shows up by itself. No typing it twice.</Point>
            <Point icon={LockSimple}>Nobody in your groups can see it, admins included.</Point>
          </ul>
        </article>
      </div>
    </section>
  );
}

function Point({ icon: Icon, children }: { icon: typeof Receipt; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <Icon size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

function HowItWorks() {
  const steps = [
    { n: "1", title: "Sign up with Google", body: "Takes a few seconds. Pick your currency and, if you like, your monthly take-home pay." },
    { n: "2", title: "Set a budget or start a group", body: "Kotasa suggests a budget from your pay. Or create a group and share the invite link." },
    { n: "3", title: "Add as you go", body: "One line per expense. Group costs split themselves, and your share counts toward your budget." },
  ];
  return (
    <section aria-labelledby="how">
      <h2 id="how" className="text-3xl font-semibold tracking-tight sm:text-4xl">
        How it works
      </h2>
      <ol className="mt-10 grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="card p-6">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink">
              {s.n}
            </span>
            <h3 className="mt-4 font-semibold">{s.title}</h3>
            <p className="mt-1.5 text-sm text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ForAnyGroup() {
  const people = ["Dilan Fernando", "Sachini Perera", "Ishara Silva", "Nuwan Jayasuriya"];
  return (
    <section className="card grid items-center gap-8 p-6 sm:p-10 md:grid-cols-[1.2fr_1fr]" aria-labelledby="any-group">
      <div>
        <h2 id="any-group" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Some people won&apos;t install another app. That&apos;s fine.
        </h2>
        <p className="mt-3 text-muted">
          Add them by name and mobile number. Each week they get an SMS with their total and a link to a read-only bill
          that shows where every rupee came from.
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-bg p-4">
        <div className="flex items-center gap-2 text-xs text-muted">
          <ChatText size={14} aria-hidden="true" /> Friday SMS
        </div>
        <p className="mt-1.5 text-sm leading-snug">
          {BRAND.name}: your total this week is <span className="font-semibold tabular-nums">Rs. 2,385</span>. See the
          details at <span className="text-brand">kotasa…/b/…</span>
        </p>
        <div className="mt-4 flex -space-x-2">
          {people.map((n) => (
            <span key={n} className="rounded-[32%] ring-2 ring-bg">
              <Avatar name={n} size={30} />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCall() {
  return (
    <section className="text-center">
      <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">Know where your money goes.</h2>
      <p className="mx-auto mt-4 max-w-md text-muted">Start with your own budget, or bring your group.</p>
      <Link href="/signup" className="btn-primary mt-8 min-h-12 rounded-full px-8 text-[15px]">
        Get started <ArrowRight size={16} weight="bold" aria-hidden="true" />
      </Link>
    </section>
  );
}
