import { Suspense } from "react";
import Link from "next/link";
import { Plus, SlidersHorizontal } from "@phosphor-icons/react/ssr";
import { getMemberships, requireMember } from "@/lib/auth";
import { rememberGroup } from "@/lib/accounts";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";
import { LogoMark } from "@/components/brand";
import { BottomNav, TopNav, type NavConfig } from "@/components/app-nav";
import { GroupSwitcher } from "@/components/group-switcher";
import { Avatar, Loading } from "@/components/bits";

export default function GroupLayout({ children, params }: LayoutProps<"/g/[slug]">) {
  return (
    <Suspense fallback={<Shell />}>
      <Gate params={params}>{children}</Gate>
    </Suspense>
  );
}

function Shell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4">
      <div className="h-16" />
      {children ?? <Loading />}
    </div>
  );
}

async function Gate({ children, params }: { children: React.ReactNode; params: LayoutProps<"/g/[slug]">["params"] }) {
  const { slug } = await params;
  const ctx = await requireMember(slug);
  const [memberships] = await Promise.all([getMemberships(ctx.profile.id), rememberGroup(ctx.profile, ctx.org.id)]);
  const groups = memberships
    .filter((m) => m.member.status !== "inactive")
    .map((m) => ({ slug: m.org.slug, name: m.org.name, pending: m.member.status === "pending" }));
  const nav: NavConfig = {
    base: ctx.base,
    meals: ctx.settings.meals_enabled,
    budgets: ctx.settings.budgets_enabled,
    admin: ADMIN_PERMISSIONS.some((p) => ctx.perms.has(p)),
  };

  return (
    <>
      <a
        href="#main"
        className="sr-only z-40 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="no-print sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link href={ctx.base} aria-label={`${ctx.org.name} home`} className="shrink-0">
              <LogoMark size={30} />
            </Link>
            <GroupSwitcher current={slug} groups={groups} />
          </div>
          <TopNav config={nav} />
          <div className="flex shrink-0 items-center gap-2">
            {ctx.perms.has("expense.add") && (
              <Link href={`${ctx.base}/expenses/new`} className="btn-primary hidden md:inline-flex">
                <Plus size={16} aria-hidden="true" /> Add expense
              </Link>
            )}
            {nav.admin && (
              <Link href={`${ctx.base}/admin`} className="btn-ghost px-2.5 md:hidden" aria-label="Admin">
                <SlidersHorizontal size={18} aria-hidden="true" />
              </Link>
            )}
            <Link href={`${ctx.base}/account`} aria-label="Your account" className="md:hidden">
              <Avatar name={ctx.member.full_name} size={34} />
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 pt-5 pb-28 md:pb-12">
        {children}
      </main>
      <BottomNav config={nav} />
    </>
  );
}
