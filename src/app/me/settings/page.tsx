import type { Metadata } from "next";
import { CheckCircle, DeviceMobile, GoogleLogo, LockSimple, SignOut } from "@phosphor-icons/react/ssr";
import { logout } from "@/app/actions/auth";
import { loginMethods } from "@/lib/logins";
import { displayPhone } from "@/lib/phone";
import { getGroupFeeds, getMe } from "@/lib/personal";
import type { Profile } from "@/lib/types";
import { PinForm } from "@/components/account-forms";
import { PageHeader } from "@/components/bits";
import { ConnectPhoneForm } from "@/components/sign-in-forms";
import { ConnectGoogle } from "@/components/google-button";
import { CategoryList, GroupFeedCard, MoneySettingsForm } from "@/components/me-settings-forms";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Settings" };

const NOTICES: Record<string, string> = {
  "google=connected": "Google is connected. You can log in with Google or your number and PIN.",
  "phone=connected": "Your accounts are connected. Your groups and history are all here now.",
};

export default async function MeSettings({ searchParams }: PageProps<"/me/settings">) {
  const { profile, currency, categories } = await getMe();
  const [feeds, methods, sp] = await Promise.all([getGroupFeeds(profile.id, categories), loginMethods(profile.id), searchParams]);
  const notice = Object.entries(sp).map(([k, v]) => NOTICES[`${k}=${v}`]).find(Boolean);
  return (
    <div className="stagger mx-auto max-w-xl space-y-6">
      <PageHeader title="Settings" sub={profile.full_name} />
      <p className="flex items-start gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-strong">
        <LockSimple size={16} weight="duotone" className="mt-0.5 shrink-0" aria-hidden="true" />
        Me is private. Nobody in your groups, admins included, can see your budgets or what you add here.
      </p>

      {notice && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-strong">
          <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
          {notice}
        </p>
      )}

      <MoneySettingsForm currency={currency} income={profile.monthly_income} payday={profile.payday} />

      <SignInCard profile={profile} methods={methods} />

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

/** How you log in: Google and/or mobile + PIN, with ways to add the one you don't have. */
function SignInCard({ profile, methods }: { profile: Profile; methods: Set<string> }) {
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_LOGIN !== "off";
  const hasGoogle = methods.has("google");
  const hasPin = methods.has("pin");
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">Sign-in</h2>
        <p className="text-sm text-muted">Two ways in means you can still log in if you lose one.</p>
      </div>

      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
          <GoogleLogo size={18} weight="bold" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Google</p>
          <p className="truncate text-sm text-muted">{hasGoogle ? (profile.email ?? "Connected") : "Not connected"}</p>
        </div>
      </div>
      {!hasGoogle && googleEnabled && <ConnectGoogle />}

      <div className="space-y-3 border-t border-line pt-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
            <DeviceMobile size={18} weight="bold" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Mobile number + PIN</p>
            <p className="text-sm text-muted">
              {hasPin && profile.phone ? displayPhone(profile.phone) : profile.phone ? `${displayPhone(profile.phone)}, no PIN yet` : "Not set up"}
            </p>
          </div>
        </div>
        {hasPin ? (
          <details className="group">
            <summary className="cursor-pointer text-sm font-semibold text-brand">Change PIN</summary>
            <div className="pt-3">
              <PinForm hasPin needsPhone={false} />
            </div>
          </details>
        ) : (
          <>
            <PinForm hasPin={false} needsPhone={!profile.phone} />
            {!profile.phone && (
              <details className="rounded-xl bg-surface-2 px-3 py-2.5">
                <summary className="cursor-pointer text-sm font-semibold">Already use Kotasa with your mobile number?</summary>
                <p className="mt-2 text-sm text-muted">
                  Enter that number and its PIN. This Google login moves to that account, with all its groups and
                  history.
                </p>
                <div className="pt-3">
                  <ConnectPhoneForm back="settings" />
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  );
}
