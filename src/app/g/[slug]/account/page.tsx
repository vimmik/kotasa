import Link from "next/link";
import { BookOpenText, ClockCounterClockwise, SignOut, SquaresFour } from "@phosphor-icons/react/ssr";
import { requireMember } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { getLedgerFor, listMembers } from "@/lib/ledger";
import { loginMethods } from "@/lib/logins";
import { expenseIconMap, getRoles } from "@/lib/org-config";
import { appUrl } from "@/lib/brand";
import { displayPhone } from "@/lib/phone";
import { logout } from "@/app/actions/auth";
import { ActivityList } from "@/components/activity";
import { Avatar, EmptyState } from "@/components/bits";
import { ThemeToggle } from "@/components/theme-toggle";
import { CopyLink, LeaveGroupForm, PinForm } from "@/components/account-forms";
import { DevelopedBy } from "@/components/brand";

export default async function AccountPage(props: PageProps<"/g/[slug]/account">) {
  const { slug } = await props.params;
  const ctx = await requireMember(slug);
  const { profile, member: me, org, base } = ctx;
  const [people, rows, methods, roles] = await Promise.all([
    listMembers(org.id, { includeInactive: true }),
    getLedgerFor(org.id, me.id, { limit: 200 }),
    loginMethods(profile.id),
    getRoles(org.id),
  ]);
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const icons = await expenseIconMap(
    org.id,
    rows.filter((r) => r.source === "expense").map((r) => r.ref_id),
  );
  const roleLabel = roles.find((r) => r.key === me.role_key)?.label ?? me.role_key;

  return (
    <div className="stagger mx-auto max-w-2xl space-y-5">
      <section className="card flex items-center gap-4 p-5">
        <Avatar name={profile.full_name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{profile.full_name}</h1>
          <p className="truncate text-sm text-muted">
            {[displayPhone(profile.phone), profile.email].filter(Boolean).join(" · ") || "No contact details"}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="pill bg-amber-soft text-amber-ink">
              {roleLabel} in {org.name}
            </span>
            {methods.has("google") && <span className="pill bg-info-soft text-info-ink">Google</span>}
            {methods.has("pin") && <span className="pill bg-surface-2 text-muted">PIN</span>}
          </div>
        </div>
      </section>

      <Link href="/groups" className="card-link flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
          <SquaresFour size={18} weight="duotone" aria-hidden="true" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">Your groups</span>
          <span className="text-sm text-muted">Switch group, create a new one, or see invites</span>
        </span>
      </Link>

      <Link href={`${base}/guide`} className="card-link flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
          <BookOpenText size={18} weight="duotone" aria-hidden="true" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">How {BRAND.name} works</span>
          <span className="text-sm text-muted">A quick guide to splitting, settling and the weekly SMS</span>
        </span>
      </Link>

      <section className="card space-y-3">
        <h2 className="font-semibold">Appearance</h2>
        <ThemeToggle />
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">Phone + PIN login</h2>
          <p className="text-sm text-muted">
            {profile.phone
              ? `Log in with ${displayPhone(profile.phone)} and a 6-digit PIN.`
              : "Add your mobile number and choose a PIN to log in without Google."}
          </p>
        </div>
        <PinForm hasPin={methods.has("pin")} needsPhone={!profile.phone} />
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">Your bill link for {org.name}</h2>
          <p className="text-sm text-muted">
            The read-only page your weekly SMS links to. Anyone with it can see your balances in this group.
          </p>
        </div>
        <CopyLink url={`${appUrl()}/b/${me.view_token}`} />
      </section>

      <section id="history" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted">History in {org.name}</h2>
          <Link href={`${base}/settle`} className="text-sm font-semibold text-brand">
            Record a payment
          </Link>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={ClockCounterClockwise}
            title="Nothing yet"
            body="Expenses, meals and payments that involve you will show up here."
          />
        ) : (
          <div className="card py-1">
            <ActivityList rows={rows} me={me.id} names={names} icons={icons} base={base} />
          </div>
        )}
      </section>

      <LeaveGroupForm groupName={org.name} />

      <form action={logout}>
        <button className="btn-ghost w-full text-danger">
          <SignOut size={16} aria-hidden="true" /> Log out
        </button>
      </form>

      <DevelopedBy className="pt-2" />
    </div>
  );
}
