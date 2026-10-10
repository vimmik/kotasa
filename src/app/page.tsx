import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getMemberships, requireProfile } from "@/lib/auth";
import { Loading } from "@/components/bits";

/** "/" sends you to the group you used last, or to /groups. */
export default function Root() {
  return (
    <Suspense fallback={<Loading />}>
      <Pick />
    </Suspense>
  );
}

async function Pick(): Promise<React.ReactNode> {
  const profile = await requireProfile();
  const active = (await getMemberships(profile.id)).filter((m) => m.member.status === "active");
  const last = active.find((m) => m.org.id === profile.last_org_id) ?? (active.length === 1 ? active[0] : null);
  redirect(last ? `/g/${last.org.slug}` : "/groups");
}
