import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

/** The Kotasa mark: a plate cut into shares, one share handed over. */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} aria-hidden="true">
      <rect width="512" height="512" rx="116" fill="var(--brand)" />
      <g transform="translate(-10 10)" fill="var(--brand-ink)">
        <path d="M256 256 L106 256 A150 150 0 0 1 256 106 Z" transform="translate(-7 -7)" />
        <path d="M256 256 L256 406 A150 150 0 0 1 106 256 Z" transform="translate(-7 7)" />
        <path d="M256 256 L406 256 A150 150 0 0 1 256 406 Z" transform="translate(7 7)" />
        <path d="M256 256 L256 106 A150 150 0 0 1 406 256 Z" fill="var(--amber)" transform="translate(30 -30)" />
      </g>
    </svg>
  );
}

export function Logo({ href = "/", size = 30 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label={`${BRAND.name} home`}>
      <LogoMark size={size} />
      <span className="text-[1.15rem] font-bold tracking-tight">{BRAND.name.toLowerCase()}</span>
    </Link>
  );
}

/** "Developed by Vimmik" credit line. */
export function DevelopedBy({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-center justify-center gap-1.5 text-xs text-muted ${className}`}>
      Developed by
      <a
        href={BRAND.developer.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 font-semibold text-ink hover:text-brand hover:underline"
      >
        {/* The logo has its own light round background, so it reads on dark themes too. */}
        <Image src={BRAND.developer.logo} alt="" width={20} height={20} className="rounded-full" />
        {BRAND.developer.name}
      </a>
    </p>
  );
}
