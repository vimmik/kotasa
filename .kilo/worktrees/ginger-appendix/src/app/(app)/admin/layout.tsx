import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";
import { Loading } from "@/components/bits";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="space-y-5">
      <AdminNav />
      <Suspense fallback={<Loading />}>
        <Gate>{children}</Gate>
      </Suspense>
    </div>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
