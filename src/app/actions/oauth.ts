"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { mcpAllowed } from "@/lib/mcp/auth";
import { createClient } from "@/lib/supabase/server";

// Letting Claude (or another MCP client) read your Kotasa. Supabase Auth's OAuth 2.1 server runs
// the protocol; these only answer its consent question and revoke access, always as the logged-in
// person (their own session), never with the service key.

const AUTH_ID = /^[A-Za-z0-9_-]{8,200}$/;
const CLIENT_ID = /^[0-9a-f-]{36}$/;

/** Allow or deny one authorization request from /oauth/consent, then go back to the app that asked. */
export async function decideOAuth(f: FormData) {
  const id = String(f.get("authorization_id") ?? "");
  const allow = f.get("decision") === "allow";
  if (!AUTH_ID.test(id)) redirect("/oauth/consent?error=bad_request");
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);

  const supabase = await createClient();
  const { data, error } =
    allow && mcpAllowed(profile).ok
      ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) redirect(`/oauth/consent?authorization_id=${id}&error=failed`);
  redirect(data.redirect_url);
}

/** Me › Settings: stop an app (e.g. Claude) from reading your Kotasa. Its tokens stop working. */
export async function revokeAppAccess(f: FormData) {
  const clientId = String(f.get("client_id") ?? "");
  if (!CLIENT_ID.test(clientId)) return;
  if (!(await getCurrentProfile())) redirect("/login");
  const supabase = await createClient();
  await supabase.auth.oauth.revokeGrant({ clientId });
  refresh();
}
