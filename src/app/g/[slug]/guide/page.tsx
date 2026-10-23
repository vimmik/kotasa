import Link from "next/link";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
  ArrowRight,
  ArrowsClockwise,
  CaretDown,
  ChartPieSlice,
  ChatText,
  CheckCircle,
  ClockCounterClockwise,
  ForkKnife,
  HandCoins,
  Receipt,
  Scales,
  ShieldCheck,
  SlidersHorizontal,
  UsersThree,
} from "@phosphor-icons/react/ssr";
import { can, requireMember } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { listMembers } from "@/lib/ledger";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";
import { WEEKDAYS } from "@/lib/time";
import { rs } from "@/lib/types";
import { Avatar, PageHeader } from "@/components/bits";

export default async function GuidePage(props: PageProps<"/g/[slug]/guide">) {
  const { slug } = await props.params;
  const ctx = await requireMember(slug);
  const { org, settings, base } = ctx;
  const people = await listMembers(org.id);
  const collector = people.find((p) => p.id === settings.collector_id)?.full_name.split(" ")[0];
  const billDay = WEEKDAYS[settings.billing_weekday - 1];
  const isAdmin = ADMIN_PERMISSIONS.some((p) => ctx.perms.has(p));

  const features: Feature[] = [
    {
      icon: Receipt,
      title: "Add an expense",
      body: "Paid for something the group shares? Add it and pick who it's for.",
      steps: [
        "Tap Add expense, enter what it was and how much.",
        "Choose who paid. It doesn't have to be you. Paid together? Tap Someone else paid part of it and add how much each person put in.",
        "Tick the people it's for. Split equally (the default) or type a custom amount per person.",
        "Save. Everyone's balance updates straight away.",
      ],
      href: can(ctx, "expense.add") ? `${base}/expenses/new` : `${base}/expenses`,
      cta: can(ctx, "expense.add") ? "Add an expense" : "See expenses",
    },
    {
      icon: HandCoins,
      title: "Settle up",
      body: "Paid someone back in cash or by bank transfer? Record it so the debt clears.",
      steps: [
        "On Home, tap Settle next to someone you owe.",
        "The amount is filled in. Change it if you paid part of it.",
        "Save. Your balance with them goes down by that amount.",
        "Got paid? Tap Got paid next to the person who paid you.",
      ],
      href: `${base}/settle`,
      cta: "Record a payment",
    },
    ...(settings.meals_enabled
      ? [
          {
            icon: ForkKnife,
            title: "Order meals",
            body: "Pick your breakfast or lunch from the day's menu before the cutoff.",
            steps: [
              "Open Meals and pick a day.",
              "Choose your item, or join a shared-bill meal if it's one of those.",
              "Orders lock at the cutoff time, so order before then.",
              "Your meal is added to what you owe the person who paid the shop.",
            ],
            href: `${base}/meals`,
            cta: "Open meals",
          } satisfies Feature,
        ]
      : []),
    ...(settings.budgets_enabled
      ? [
          {
            icon: ChartPieSlice,
            title: "Budgets",
            body: "Keep a fund or a plan on track, like a trip, a party or a monthly tea fund.",
            steps: [
              "Create a budget with an optional limit.",
              "Link expenses to it when you add them.",
              "The progress bar shows how much is used and how much is left.",
            ],
            href: `${base}/budgets`,
            cta: "See budgets",
          } satisfies Feature,
        ]
      : []),
    {
      icon: ChatText,
      title: "The weekly SMS",
      body: `Every ${billDay}, people who owe money get one SMS with their total and a link to their bill.`,
      steps: [
        "The SMS shows how much you owe and who to pay.",
        "The link opens a read-only bill showing where each amount came from. No login needed.",
        Number(settings.sms_fee) > 0
          ? `A small SMS fee of ${rs(settings.sms_fee)} is added once a week${collector ? `, owed to ${collector}` : ""}.`
          : "There is no SMS fee in this group.",
        "People without the app get this SMS too, so everyone stays in the loop.",
      ],
      href: `${base}/account`,
      cta: "Find your bill link",
    },
    {
      icon: UsersThree,
      title: "Groups and people",
      body: "Use one group per circle: your office, friends, a trip, family.",
      steps: [
        "Each group has its own people, expenses and settings. Nothing is shared between groups.",
        "Switch groups from the name at the top left.",
        "New people join with an invite link, or an admin adds them by name and mobile number.",
        "Someone without the app can still be added. They just get the SMS and bill link.",
      ],
      href: "/groups",
      cta: "Your groups",
    },
  ];

  return (
    <div className="stagger mx-auto max-w-3xl space-y-8">
      <PageHeader title={`How ${BRAND.name} works`} sub={`A quick guide to sharing costs in ${org.name}.`} />

      {/* The idea in three steps */}
      <section className="card relative overflow-hidden p-0">
        <div
          className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-brand-soft opacity-70 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative px-5 pt-5">
          <p className="text-xs font-medium tracking-[0.14em] text-brand-strong uppercase">{BRAND.tagline}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Anyone pays. {BRAND.name} keeps count. Everyone settles once a week.
          </h2>
        </div>
        <ol className="relative mt-5 grid border-t border-line sm:grid-cols-3">
          {[
            { n: 1, title: "Someone pays", body: "For lunch, an Uber, a cake. Whoever has cash on them." },
            { n: 2, title: "Add it and split it", body: `${BRAND.name} works out each person's share to the cent.` },
            { n: 3, title: "Settle weekly", body: `On ${billDay} everyone sees one clear total and pays it.` },
          ].map((s) => (
            <li key={s.n} className="flex gap-3 border-line px-5 py-4 not-last:border-b sm:not-last:border-r sm:not-last:border-b-0">
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-ink">
                {s.n}
              </span>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Why it helps */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">Why it helps</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Benefit icon={Scales} title="No more “who paid?”">
            Every cost is written down with who paid and who it was for, so nobody has to remember.
          </Benefit>
          <Benefit icon={CheckCircle} title="Fair to the cent">
            Equal splits are worked out exactly. Leftover cents never go missing.
          </Benefit>
          <Benefit icon={ArrowsClockwise} title="Fewer payments">
            {BRAND.name} nets what you owe each person against what they owe you, so you pay one amount.
          </Benefit>
          <Benefit icon={ClockCounterClockwise} title="Full history">
            See where every amount came from. Unpaid balances carry over to next week automatically.
          </Benefit>
        </div>
      </section>

      {/* Reading your balance */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">Reading your balance</h2>
        <div className="card space-y-4">
          <p className="text-sm">
            Say Nimal pays <b>{rs(1200)}</b> for lunch for four people, including you. Each share is <b>{rs(300)}</b>.
          </p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            <li className="flex items-center gap-3 px-3 py-2.5">
              <Avatar name="Nimal Perera" size={30} />
              <span className="flex-1 text-sm">
                On <b>your</b> Home, under <b>You owe</b>
              </span>
              <span className="text-sm font-semibold text-danger tabular-nums">−{rs(300)}</span>
            </li>
            <li className="flex items-center gap-3 px-3 py-2.5">
              <Avatar name="You" size={30} />
              <span className="flex-1 text-sm">
                On <b>Nimal&apos;s</b> Home, under <b>Owes you</b>
              </span>
              <span className="text-sm font-semibold text-brand tabular-nums">+{rs(300)}</span>
            </li>
          </ul>
          <p className="text-sm text-muted">
            The big number on Home is your <b className="text-ink">net</b>: everything you&apos;re owed minus everything you
            owe, across the whole group. Red means you owe, green means you&apos;re owed. When you pay Nimal and record it,
            both sides go back to zero.
          </p>
        </div>
      </section>

      {/* Features, step by step */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">Step by step</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {features.map((f) => (
            <FeatureCard key={f.title} feature={f} />
          ))}
        </div>
      </section>

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted">For admins</h2>
          <Link href={`${base}/admin`} className="card-link flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-soft text-amber-ink">
              <SlidersHorizontal size={18} weight="duotone" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">The Admin area</p>
              <p className="text-muted">
                Add people and invite links, approve joins and set roles. Set the daily menu and meal cutoffs, see the
                packing list, fix anyone&apos;s order, preview and send the weekly SMS, close the books so settled weeks
                stop changing, and turn modules on or off in Settings. You only see the tabs your role allows.
              </p>
            </div>
            <ArrowRight size={18} className="mt-1 shrink-0 text-muted" aria-hidden="true" />
          </Link>
        </section>
      )}

      {/* FAQ */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">Questions</h2>
        <div className="card divide-y divide-line py-1">
          <Faq q="Who can edit or delete an expense?">
            The person who added it, anyone who paid for it, and anyone whose role allows editing any expense.
          </Faq>
          {settings.simplify_debts !== false && (
            <Faq q="Why do I pay someone other than who paid for my share?">
              This group settles with fewer payments. If you owe someone who owes another person, Kotasa may ask you to pay
              that person directly, but only someone you have shared with in this group, or the group&apos;s collector. Your
              total stays the same; only who you pay changes. Admins can turn this off in Settings.
            </Faq>
          )}
          <Faq q="Why can't I change an old expense or payment?">
            The group&apos;s books are closed up to a date. Balances up to then are frozen as they were, so a payment or a
            late change can&apos;t move what other people were told. Anything after that date works as usual. An owner can
            reopen the latest close if something needs fixing.
          </Faq>
          <Faq q="I paid someone outside the app. What now?">
            Record it with Settle. Pick who you paid and the amount. It works for cash, bank transfers or anything else.
          </Faq>
          <Faq q="I share several groups with the same person. Where's the total?">
            Open Your groups (the group switcher). Across all your groups lists everyone you owe or who owes you, with
            each group&apos;s amount added up into one total. Payments are still recorded inside each group.
          </Faq>
          <Faq q="What if I don't pay this week?">
            Nothing breaks. What you still owe carries over and shows up in next week&apos;s total.
          </Faq>
          <Faq q="I forgot my PIN.">
            Ask an admin of your group to reset it, or log in with Google if you&apos;ve linked it. You can change your PIN
            any time on your Account page.
          </Faq>
          <Faq q="Can I leave a group?">
            Yes, from your Account page. Your history stays, and anything you still owe is still owed.
          </Faq>
          <Faq q="What is Me?">
            Your own budget and spending, private to you. Your share of this group&apos;s expenses and meals shows up there
            by itself, next to anything you add yourself. Open it from the group menu at the top.
          </Faq>
          <Faq q="Who can see my balances?">
            Only people in this group. Your bill link shows your balances to anyone who has the link, so share it with care.
          </Faq>
        </div>
      </section>

      <p className="flex items-center justify-center gap-2 text-center text-sm text-muted">
        <ShieldCheck size={16} aria-hidden="true" /> Each group&apos;s data is kept separate from every other group.
      </p>
    </div>
  );
}

type Feature = { icon: PhosphorIcon; title: string; body: string; steps: string[]; href: string; cta: string };

function FeatureCard({ feature: f }: { feature: Feature }) {
  const Icon = f.icon;
  return (
    <article className="card flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
          <Icon size={18} weight="duotone" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold">{f.title}</h3>
          <p className="text-sm text-muted">{f.body}</p>
        </div>
      </div>
      <ol className="space-y-1.5 text-sm">
        {f.steps.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-muted tabular-nums">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <Link href={f.href} className="mt-auto inline-flex items-center gap-1 self-start text-sm font-semibold text-brand hover:underline">
        {f.cta} <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </article>
  );
}

function Benefit({ icon: Icon, title, children }: { icon: PhosphorIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="card flex gap-3">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-brand-strong">
        <Icon size={18} weight="duotone" aria-hidden="true" />
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted">{children}</p>
      </div>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group py-1">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-2.5 font-semibold [&::-webkit-details-marker]:hidden">
        {q}
        <CaretDown size={16} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <p className="pb-3 text-sm text-muted">{children}</p>
    </details>
  );
}
