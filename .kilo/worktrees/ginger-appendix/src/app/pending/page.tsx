import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { getCurrentPerson } from "@/lib/auth";
import { cancelPending, logout } from "@/app/actions/auth";
import { LogoMark } from "@/components/brand";
import { Loading } from "@/components/bits";

export default function PendingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-8">
      <Suspense fallback={<Loading />}>
        <Pending />
      </Suspense>
    </main>
  );
}

async function Pending() {
  const me = await getCurrentPerson();
  if (!me) redirect("/login");
  if (me.status === "active") redirect("/");
  return (
    <div className="space-y-5">
      <LogoMark size={48} />
      <div className="card space-y-3 p-5">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-amber-soft text-amber-ink">
          <Clock size={20} aria-hidden="true" />
        </span>
        <h1 className="text-xl font-extrabold">Waiting for approval</h1>
        <p className="text-sm text-muted">
          Hi {me.full_name.split(" ")[0]}, your request to join is with the admin. Once they approve it and add your
          mobile number, you&apos;ll see your balances here. Come back in a bit.
        </p>
        <p className="text-xs text-muted">Signed in as {me.email}</p>
      </div>
      <div className="flex gap-2">
        <form action={logout}>
          <button className="btn-ghost">Log out</button>
        </form>
        <form action={cancelPending}>
          <button className="btn-ghost text-danger">Cancel request</button>
        </form>
      </div>
    </div>
  );
}
