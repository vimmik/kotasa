import Link from "next/link";
import { DevelopedBy, Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

/** Shell for /privacy and /terms: plain reading layout, public, no app chrome. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-12 sm:px-6">
      <header className="flex h-16 items-center justify-between">
        <Logo href="/" size={30} />
        <ThemeToggle compact />
      </header>
      <main className="pt-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
        <div className="mt-8 space-y-8 text-[15px] leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1.5 [&_section>*+*]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:font-medium [&_a]:text-brand [&_a]:underline-offset-2 hover:[&_a]:underline">
          {children}
        </div>
      </main>
      <footer className="mt-14 space-y-4 border-t border-line pt-6 text-center text-sm text-muted">
        <nav className="flex justify-center gap-5" aria-label="Legal">
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/" className="hover:text-ink">Home</Link>
        </nav>
        <DevelopedBy />
      </footer>
    </div>
  );
}
