import Link from "next/link";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
  ArrowRight,
  ArrowsClockwise,
  CaretDown,
  ChartBar,
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
import { receiptScanEnabled } from "@/lib/receipt";
import { smsScheduleText } from "@/lib/sms";
import { rs } from "@/lib/types";
import { Avatar, PageHeader } from "@/components/bits";

export default async function GuidePage(props: PageProps<"/g/[slug]/guide">) {
  const { slug } = await props.params;
  const ctx = await requireMember(slug);
  const { org, settings, base } = ctx;
  const people = await listMembers(org.id);
  const collector = people.find((p) => p.id === settings.collector_id)?.full_name.split(" ")[0];
  const isAdmin = ADMIN_PERMISSIONS.some((p) => ctx.perms.has(p));

  const features: Feature[] = [
    {
      icon: Receipt,
      title: "Add an expense",
      body: "Paid for something the group shares? Add it and pick who it's for.",
      steps: [
        "Tap Add expense, enter what it was and how much.",
        "Choose who paid. It doesn't have to be you. Paid together? Tap Someone else paid part of it and add how much each person put in.",
        "Tick the people it's for. Split equally (the default), by item, or type a custom amount per person.",
        "Shared a restaurant bill? Choose By item, add each dish and tick who had it. Tax, charges and discounts are shared in proportion to what each person had, so nobody pays for someone else's bigger order.",
        ...(receiptScanEnabled() ? ["Have the bill? Tap Scan a bill and the items, tax, charges and discounts fill in by themselves."] : []),
        "Save. Everyone's balance updates straight away.",
        "Same crowd as last time? Tap one of the Same as before chips to tick them all at once. A regular cost (the daily Uber)? Open it and tap Add again.",
        "Looking for an old one? Search on the Expenses page looks through every week.",
      ],
      href: can(ctx, "expense.add") ? `${base}/expenses/new` : `${base}/expenses`,
      cta: can(ctx, "expense.add") ? "Add an expense" : "See expenses",
    },
    {
      icon: HandCoins,
      title: "Settle up",
      body: "Paid someone back in cash or by bank transfer? Record it so the debt clears.",
      steps: [
        "On Home, tap Pay next to someone you owe (or Pay on the expense itself).",
        "The amount is filled in. Change it if you paid part of it.",
        "Save. Your balance with them goes down by that amount.",
        "Got paid? Tap Got paid next to the person who paid you.",
        "Paying by bank? Tap Copy no. next to their bank details and paste it in your banking app. After you record it, Tell them sends a ready message.",
        "Someone slow to pay? Tap the bell next to their name for a friendly reminder you can send on WhatsApp, with your bank details in it.",
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
      icon: ChartBar,
      title: "Insights",
      body: "See where the group's money went each month, and how much of it was yours.",
      steps: [
        "Open Insights from Home or the Expenses page.",
        "The top row shows what the group spent, your share, and what you paid up front, compared with last month.",
        "By category shows where it went. Who paid shows who put money in.",
        "Use the arrows to look at earlier months.",
      ],
      href: `${base}/insights`,
      cta: "Open Insights",
    },
    {
      icon: ChatText,
      title: "The SMS",
      body: `${smsScheduleText(settings).replace(/^./, (c) => c.toUpperCase())}, people who owe money get one SMS with their total and a link to their bill.`,
      steps: [
        "The SMS shows how much you owe, who to pay and their bank details (when they've added them in Account).",
        "The link opens a read-only bill showing where each amount came from. No login needed.",
        Number(settings.sms_fee) > 0
          ? `A small SMS fee of ${rs(settings.sms_fee)} is added at most once a week${collector ? `, owed to ${collector}` : ""}.`
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
            { n: 3, title: "Settle up", body: `${smsScheduleText(settings).replace(/^./, (c) => c.toUpperCase())} everyone gets one clear total and pays it.` },
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
                packing list, fix anyone&apos;s order, preview and send the SMS, close the books so settled weeks
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
              that person directly, usually someone you have shared with in this group, or the group&apos;s collector. Your
              total stays the same; only who you pay changes. Someone who is owed money overall, or has settled, is never
              asked to pay. Admins can turn this off in Settings.
            </Faq>
          )}
          <Faq q="Why can't I change an old expense or payment?">
            The group&apos;s books are closed up to a date. Balances up to then are saved as they were, so a late change
            can&apos;t move what other people were told. A saved amount between two people only changes when one of them
            pays, gets paid or is owed something new. Anything after that date works as usual, and today is never closed.
            An owner can reopen the latest close if something needs fixing.
          </Faq>
          <Faq q="I tapped Record payment twice. Is it saved twice?">
            No. One payment form saves once, however many times it is sent. If you record the same payment again within 10
            minutes, Kotasa asks whether it really is a second payment before saving it.
          </Faq>
          <Faq q="Where do I send the money?">
            To the person Kotasa says you owe, by cash or bank transfer. If they added their bank details (Account › How
            people pay you), they show next to their name on Home, the payment page, your bill link and the SMS. If your
            group added a How to pay note, it shows on Home and on your bill link whenever you owe something.
          </Faq>
          <Faq q="Why do I owe this person that much?">
            On Home, tap why? next to their name. You see what is directly between you two, every expense, meal and
            payment behind it, and whether part of the amount was moved there to keep the number of payments small.
          </Faq>
          <Faq q="Can I get my history into Excel?">
            Yes. Account › History has a CSV download of everything that involves you. Insights has one for all of the
            group&apos;s expenses in a month.
          </Faq>
          <Faq q="I paid someone outside the app. What now?">
            Tap Pay next to them on Home, or record it from Account › Record a payment. Pick who you paid and the amount. It works for cash, bank transfers or anything else.
          </Faq>
          <Faq q="I paid someone days ago and forgot to record it. What now?">
            Record it with the day you paid. A payment dated before today waits for the person you paid to confirm they got
            it (an admin confirms for someone without the app), and your balance changes once they do. Until then Home
            shows it as waiting, so you don&apos;t pay twice. If they tap Not received, it isn&apos;t counted.
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
