import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { hasAdmin } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

/** Only shown before the first admin exists. */
async function SetupLink() {
  if (await hasAdmin()) return null;
  return (
    <>
      Setting up for your office?{" "}
      <Link href="/setup" className="font-semibold text-brand underline-offset-2 hover:underline">
        Create the admin account
      </Link>
    </>
  );
}

export default function LoginPage() {
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_LOGIN !== "off";
  return (
    <AuthShell
      title="Welcome back"
      sub="Log in with your mobile number and PIN."
      footer={
        <Suspense>
          <SetupLink />
        </Suspense>
      }
    >
      <Suspense>
        <LoginForm googleEnabled={googleEnabled} />
      </Suspense>
    </AuthShell>
  );
}
