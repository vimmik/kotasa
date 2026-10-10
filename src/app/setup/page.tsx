import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { hasAdmin } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up" };

/** Setup is one-time: once an admin exists, send people to log in. */
async function Gate() {
  if (await hasAdmin()) redirect("/login");
  return <SetupForm />;
}

export default function SetupPage() {
  return (
    <AuthShell
      title="Set up your office"
      sub="Create the first admin. This works once; after that, admins add people from the panel. You can also sign in with Google first instead and the very first account becomes admin."
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
