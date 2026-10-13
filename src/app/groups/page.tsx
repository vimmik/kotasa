import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Hourglass, SignOut, Wallet } from "@phosphor-icons/react/ssr";
import { getMemberships, requireProfile } from "@/lib/auth";
import { ORG_KINDS } from "@/lib/types";
import { logout } from "@/app/actions/auth";
import { LogoMark } from "@/components/brand";
import { Avatar, Loading } from "@/components/bits";
import { ThemeToggle } from "@/components/theme-toggle";
import { CreateGroupForm } from "./create-group-form";
import { AcrossGroups } from "./across-groups";

export const metadata: Metadata = { title: "Your groups" };

export default function GroupsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <header className="flex h-16 items-center justify-between">
        <span className="flex items-center gap-2">
          <LogoMark size={30} />
          <span className="text-[1.15rem] font-bold tracking-tight">kotasa</span>
        </span>
        <ThemeToggle compact />
      </header>
      <Suspense fallback={<Loading />}>
        <Groups />
      </Suspense>
    </div>
  );
}

async function Groups() {
  const profile = await requireProfile();
  const memberships = await getMemberships(profile.id);
  const active = memberships.filter((m) => m.member.status === "active");
  const pending = memberships.filter((m) => m.member.status === "pending");
  const kindLabel = (k: string) => ORG_KINDS.find((x) => x.id === k)?.label ?? "Group";

  return (
    <div className="stagger space-y-6">
      <div>
        <p className="text-sm text-muted">Hi {profile.full_name.split(" ")[0]}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your groups</h1>
      </div>

      <Link href="/me" className="card-link flex items-center gap-3">
        <span className="inline-flex size-11 items-center justify-center rounded-[32%] bg-brand-soft text-brand-strong">
          <Wallet size={20} weight="duotone" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Me</span>
          <span className="text-xs text-muted">Your own budget and spending, private to you</span>
        </span>
        <ArrowRight size={18} className="text-muted" aria-hidden="true" />
      </Link>

      {active.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {active.map(({ org }) => (
            <li key={org.id}>
              <Link href={`/g/${org.slug}`} className="card-link flex items-center gap-3">
                <Avatar name={org.name} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{org.name}</span>
                  <span className="text-xs text-muted">{kindLabel(org.kind)}</span>
                </span>
                <ArrowRight size={18} className="text-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {active.length > 0 && <AcrossGroups profileId={profile.id} />}

      {pending.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Waiting for approval</h2>
          <ul className="divide-y divide-line">
            {pending.map(({ org }) => (
              <li key={org.id} className="flex items-center gap-3 py-2.5">
                <span className="inline-flex size-9 items-center justify-center rounded-xl bg-amber-soft text-amber-ink">
                  <Hourglass size={16} aria-hidden="true" />
                </span>
                <span className="flex-1 font-medium">{org.name}</span>
                <span className="text-xs text-muted">An admin will let you in</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {active.length === 0 && pending.length === 0 && (
        <p className="card text-sm text-muted">
          You&apos;re not in any group yet. Create one below, or open an invite link someone sent you.
        </p>
      )}

      <CreateGroupForm />

      <form action={logout}>
        <button className="btn-ghost w-full text-danger">
          <SignOut size={16} aria-hidden="true" /> Log out
        </button>
      </form>
    </div>
  );
}
