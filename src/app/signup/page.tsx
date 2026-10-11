import Link from "next/link";
import type { Metadata } from "next";
import { Check } from "@phosphor-icons/react/ssr";
import { AuthShell } from "@/components/auth-shell";
import { GoogleButton } from "@/components/google-button";

export const metadata: Metadata = { title: "Sign up" };

const PERKS = [
  "Your own budget, with how much you can safely spend today",
  "Groups for the office, friends or a trip, with balances that settle themselves",
  "Your share of group costs counts toward your budget",
];

export default function SignupPage() {
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_LOGIN !== "off";
  return (
    <AuthShell
      title="Create your account"
      sub={googleEnabled ? "Use your Google account. You'll set things up in the next step." : undefined}
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand underline-offset-2 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {googleEnabled ? (
        <div className="space-y-5">
          <GoogleButton label="Sign up with Google" />
          <ul className="space-y-2.5 text-sm text-muted">
            {PERKS.map((p) => (
              <li key={p} className="flex gap-2.5">
                <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Sign-ups aren&apos;t open yet. If a group admin added you, log in with your mobile number and PIN.
        </p>
      )}
    </AuthShell>
  );
}
