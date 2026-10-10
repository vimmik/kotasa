import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/auth";
import { findInvite, membershipStatus } from "@/lib/accounts";
import { joinGroup } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { PillSubmit } from "@/components/ui";

export const metadata: Metadata = { title: "Join a group", robots: { index: false, follow: false } };

export default function JoinPage(props: PageProps<"/join/[code]">) {
  return (
    <Suspense>
      <Join params={props.params} />
    </Suspense>
  );
}

async function Join({ params }: { params: PageProps<"/join/[code]">["params"] }) {
  const { code } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
  const info = await findInvite(code);

  if (!info) {
    return (
      <AuthShell title="This invite doesn't work" sub="It may have expired, been turned off, or already been used.">
        <p className="text-sm text-muted">Ask whoever sent it for a new link.</p>
        <Link href="/groups" className="btn-ghost mt-4 w-full">
          Go to your groups
        </Link>
      </AuthShell>
    );
  }

  if ((await membershipStatus(info.org.id, profile.id)) === "active") redirect(`/g/${info.org.slug}`);

  return (
    <AuthShell
      title={`Join ${info.org.name}`}
      sub={
        info.invite.needs_approval
          ? "An admin will approve you before you can see the group."
          : `You'll join as ${profile.full_name}.`
      }
    >
      <form action={joinGroup}>
        <input type="hidden" name="code" value={code} />
        <PillSubmit pendingText="Joining…">Join {info.org.name}</PillSubmit>
      </form>
    </AuthShell>
  );
}
