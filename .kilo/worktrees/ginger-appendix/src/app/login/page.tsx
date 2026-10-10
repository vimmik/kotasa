import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { LogoMark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_LOGIN !== "off";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col px-5 pt-[max(env(safe-area-inset-top),1.5rem)] pb-8">
      <div className="flex justify-end">
        <ThemeToggle compact />
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <LogoMark size={56} />
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight">{BRAND.name}</h1>
        <p className="mt-1 mb-8 text-muted">{BRAND.tagline} Meals, rides and every shared cost at the office.</p>
        <div className="card p-5">
          <Suspense>
            <LoginForm googleEnabled={googleEnabled} />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          Setting up for your office?{" "}
          <Link href="/setup" className="font-semibold text-brand underline-offset-2 hover:underline">
            Create the admin account
          </Link>
        </p>
      </div>
    </main>
  );
}
