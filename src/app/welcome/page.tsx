import { Suspense } from "react";
import type { Metadata } from "next";
import { getMe } from "@/lib/personal";
import { LogoMark } from "@/components/brand";
import { Loading } from "@/components/bits";
import { ThemeToggle } from "@/components/theme-toggle";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false } };

/** First stop after signing up: who you are, then the one thing you want to do first. */
export default function WelcomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-10">
      <header className="flex h-16 items-center justify-between">
        <span className="flex items-center gap-2">
          <LogoMark size={30} />
          <span className="text-[1.15rem] font-bold tracking-tight">kotasa</span>
        </span>
        <ThemeToggle compact />
      </header>
      <Suspense fallback={<Loading />}>
        <Welcome />
      </Suspense>
    </main>
  );
}

async function Welcome() {
  const { profile, currency } = await getMe();
  return (
    <WelcomeForm name={profile.full_name} currency={currency} income={profile.monthly_income} hasPhone={Boolean(profile.phone)} />
  );
}
