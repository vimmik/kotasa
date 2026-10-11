import type { Metadata } from "next";
import { LockSimple, SignOut } from "@phosphor-icons/react/ssr";
import { logout } from "@/app/actions/auth";
import { getGroupFeeds, getMe } from "@/lib/personal";
import { PageHeader } from "@/components/bits";
import { CategoryList, GroupFeedCard, MoneySettingsForm } from "@/components/me-settings-forms";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Settings" };

export default async function MeSettings() {
  const { profile, currency, categories } = await getMe();
  const feeds = await getGroupFeeds(profile.id, categories);
  return (
    <div className="stagger mx-auto max-w-xl space-y-6">
      <PageHeader title="Settings" sub={profile.full_name} />
      <p className="flex items-start gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-strong">
        <LockSimple size={16} weight="duotone" className="mt-0.5 shrink-0" aria-hidden="true" />
        Me is private. Nobody in your groups, admins included, can see your budgets or what you add here.
      </p>

      <MoneySettingsForm currency={currency} income={profile.monthly_income} payday={profile.payday} />

      <section className="card space-y-1">
        <h2 className="font-semibold">Spending from your groups</h2>
        <p className="text-sm text-muted">
          Your share of each group&apos;s expenses, meals and SMS fees is added to Me by itself. What you paid for
          others isn&apos;t spending: it shows as owed to you inside the group.
        </p>
        {feeds.length === 0 ? (
          <p className="pt-2 text-sm text-muted">You&apos;re not in any group yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {feeds.map((f) => (
              <GroupFeedCard key={f.orgId} feed={f} categories={categories} myCurrency={currency} />
            ))}
          </ul>
        )}
      </section>

      <CategoryList categories={categories} />

      <section className="card flex items-center justify-between gap-3">
        <h2 className="font-semibold">Theme</h2>
        <ThemeToggle />
      </section>

      <form action={logout}>
        <button className="btn-ghost w-full text-danger">
          <SignOut size={16} aria-hidden="true" /> Log out
        </button>
      </form>
    </div>
  );
}
