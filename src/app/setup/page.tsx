import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { hasAnyProfile } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up" };

/** Setup is one-time: once anyone has an account, send people to log in. */
async function Gate() {
  if (await hasAnyProfile()) redirect("/login");
  return <SetupForm />;
}

export default function SetupPage() {
  return (
    <AuthShell
      title="Set up Kotasa"
      sub="Create the first account and its first group. This works once; after that, people sign in and create or join groups."
      footer={
        <>
          Already set up?{" "}
          <Link href="/login" className="font-semibold text-brand underline-offset-2 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <Suspense>
        <Gate />
      </Suspense>
    </AuthShell>
  );
}
