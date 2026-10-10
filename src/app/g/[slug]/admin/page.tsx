import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { adminLinks } from "@/lib/admin-links";

/** /admin lands on the first admin page this member may open. */
export default async function AdminHome(props: PageProps<"/g/[slug]/admin">) {
  const { slug } = await props.params;
  const ctx = await requireMember(slug);
  redirect(adminLinks(ctx)[0]?.href ?? ctx.base);
}
