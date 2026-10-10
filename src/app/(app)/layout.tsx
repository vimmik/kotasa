import { Suspense } from "react";
import Link from "next/link";
import { Plus, SlidersHorizontal } from "@phosphor-icons/react/ssr";
import { requireMember } from "@/lib/auth";
import { Logo } from "@/components/brand";
import { BottomNav, TopNav } from "@/components/app-nav";
import { Avatar, Loading } from "@/components/bits";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<Shell />}>
      <Gate>{children}</Gate>
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

async function Gate({ children }: { children: React.ReactNode }) {
  const me = await requireMember();
  return (
    <>
      <a
        href="#main"
        className="sr-only z-40 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="no-print sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <Logo />
          <TopNav isAdmin={me.is_admin} />
          <div className="flex items-center gap-2">
            <Link href="/expenses/new" className="btn-primary hidden md:inline-flex">
              <Plus size={16} aria-hidden="true" /> Add expense
            </Link>
            {me.is_admin && (
              <Link href="/admin" className="btn-ghost px-2.5 md:hidden" aria-label="Admin">
                <SlidersHorizontal size={18} aria-hidden="true" />
              </Link>
            )}
            <Link href="/account" aria-label="Your account" className="md:hidden">
              <Avatar name={me.full_name} size={34} />
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 pt-5 pb-28 md:pb-12">{children}</main>
      <BottomNav />
    </>
  );
}
