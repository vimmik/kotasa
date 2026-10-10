import Link from "next/link";
import { MapTrifold } from "@phosphor-icons/react/ssr";
import { LogoMark } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-5 py-8">
      <LogoMark size={48} />
      <div className="card space-y-3 p-5">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-amber-soft text-amber-ink">
          <MapTrifold size={20} weight="duotone" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted">
          This link doesn&apos;t point to anything. It may have been deleted, or the address has a typo.
        </p>
        <Link href="/" className="btn-primary w-full">
          Back to home
        </Link>
      </div>
    </main>
  );
}
