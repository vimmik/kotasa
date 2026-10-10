import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireMember } from "@/lib/auth";
import { getLedgerFor, listPeople } from "@/lib/ledger";
import { createAdminClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/brand";
import { displayPhone } from "@/lib/phone";
import { logout } from "@/app/actions/auth";
import { ActivityList } from "@/components/activity";
import { Avatar, EmptyState } from "@/components/bits";
import { ThemeToggle } from "@/components/theme-toggle";
import { CopyLink, PinForm } from "@/components/account-forms";

export default async function AccountPage() {
  const me = await requireMember();
  const admin = createAdminClient();
  const [people, rows, { data: logins }] = await Promise.all([
    listPeople({ includeInactive: true }),
    getLedgerFor(me.id, { limit: 200 }),
    admin.from("person_logins").select("method").eq("person_id", me.id),
  ]);
  const names = new Map(people.map((p) => [p.id, p.full_name]));
  const methods = new Set((logins ?? []).map((l) => l.method));
  const expenseIds = rows.filter((r) => r.source === "expense").map((r) => r.ref_id);
  const { data: cats } = expenseIds.length
    ? await admin.from("expenses").select("id, category").in("id", expenseIds)
    : { data: [] };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="card flex items-center gap-4 p-5">
        <Avatar name={me.full_name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold">{me.full_name}</h1>
          <p className="truncate text-sm text-muted">
            {[displayPhone(me.phone), me.email].filter(Boolean).join(" · ") || "No contact details"}
          </p>
          <div className="mt-1 flex gap-1.5">
            {me.is_admin && <span className="pill bg-amber-soft text-amber-ink">Admin</span>}
            {methods.has("google") && <span className="pill bg-info-soft text-info-ink">Google</span>}
            {methods.has("pin") && <span className="pill bg-surface-2 text-muted">PIN</span>}
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">Appearance</h2>
        <ThemeToggle />
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-bold">Phone + PIN login</h2>
          <p className="text-sm text-muted">
            {me.phone
              ? `Log in with ${displayPhone(me.phone)} and a 6-digit PIN.`
              : "Your admin needs to add your mobile number before you can use a PIN."}
          </p>
        </div>
        {me.phone && <PinForm hasPin={methods.has("pin")} />}
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-bold">Your bill link</h2>
          <p className="text-sm text-muted">The same read-only page your weekly SMS links to. Anyone with it can see your balances.</p>
        </div>
        <CopyLink url={`${appUrl()}/b/${me.view_token}`} />
      </section>

      <section id="history" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-muted">History</h2>
          <Link href="/settle" className="text-sm font-semibold text-brand">Record a payment</Link>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="Nothing yet" />
        ) : (
          <div className="card py-1">
            <ActivityList rows={rows} me={me.id} names={names} categories={Object.fromEntries((cats ?? []).map((c) => [c.id, c.category]))} />
          </div>
        )}
      </section>

      <form action={logout}>
        <button className="btn-ghost w-full text-danger">
          <LogOut size={16} aria-hidden="true" /> Log out
        </button>
      </form>
    </div>
  );
}
