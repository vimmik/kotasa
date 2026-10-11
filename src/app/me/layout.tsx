import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { GearSix, Plus } from "@phosphor-icons/react/ssr";
import { getMemberships } from "@/lib/auth";
import { getMe } from "@/lib/personal";
import { LogoMark } from "@/components/brand";
import { MeBottomNav, MeTopNav } from "@/components/app-nav";
import { GroupSwitcher } from "@/components/group-switcher";
import { Loading } from "@/components/bits";

export const metadata: Metadata = { title: { template: "%s · Me", default: "Me" } };

/** Me: your own money, private to you. Same shell as a group, with its own nav. */
export default function MeLayout({ children }: LayoutProps<"/me">) {
  return (
    <Suspense fallback={<Shell />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

function Shell() {
  return (
    <div className="mx-auto max-w-5xl px-4">
      <div className="h-16" />
      <Loading />
    </div>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  const groups = (await getMemberships(me.profile.id))
    .filter((m) => m.member.status !== "inactive")
    .map((m) => ({ slug: m.org.slug, name: m.org.name, pending: m.member.status === "pending" }));

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
            <Link href="/me" aria-label="Me home" className="shrink-0">
              <LogoMark size={30} />
            </Link>
            <GroupSwitcher current={null} groups={groups} />
          </div>
          <MeTopNav />
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/me/add" className="btn-primary hidden md:inline-flex">
              <Plus size={16} aria-hidden="true" /> Add spending
            </Link>
            <Link href="/me/settings" className="btn-ghost px-2.5" aria-label="Me settings">
              <GearSix size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 pt-5 pb-28 md:pb-12">
        {children}
      </main>
      <MeBottomNav />
    </>
  );
}
