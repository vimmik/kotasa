import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { adminLinks } from "@/lib/admin-links";
import { AdminNav } from "@/components/admin-nav";
import { Loading } from "@/components/bits";

export default function AdminLayout({ children, params }: LayoutProps<"/g/[slug]/admin">) {
  return (
    <Suspense fallback={<Loading />}>
      <Gate params={params}>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ children, params }: { children: React.ReactNode; params: LayoutProps<"/g/[slug]/admin">["params"] }) {
  const { slug } = await params;
  const ctx = await requireMember(slug);
  const links = adminLinks(ctx);
  if (!links.length) redirect(ctx.base);
  return (
    <div className="space-y-5">
      <AdminNav links={links} />
      {children}
    </div>
  );
}
