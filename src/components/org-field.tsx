"use client";

import { useParams } from "next/navigation";

/**
 * Hidden "org" field for forms inside /g/[slug]. Server actions use it only to pick which
 * membership to check (requireMemberFromForm); it never decides who the user is.
 */
export function OrgField() {
  const { slug } = useParams<{ slug: string }>();
  return <input type="hidden" name="org" value={slug ?? ""} />;
}
