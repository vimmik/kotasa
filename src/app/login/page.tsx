import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { hasAnyProfile } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

/** Only shown before anyone has an account (first run). */
async function SetupLink() {
  if (await hasAnyProfile()) return null;
  return (
    <>
      First time here?{" "}
      <Link href="/setup" className="font-semibold text-brand underline-offset-2 hover:underline">
        Create the first account
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
