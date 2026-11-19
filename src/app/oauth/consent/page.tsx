import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { CheckCircle, Eye, ProhibitInset } from "@phosphor-icons/react/ssr";
import { decideOAuth } from "@/app/actions/oauth";
import { getCurrentProfile } from "@/lib/auth";
import { mcpAllowed } from "@/lib/mcp/auth";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth-shell";
import { Loading } from "@/components/bits";

export const metadata: Metadata = { title: "Allow access", robots: { index: false } };

const CAN = [
  "Your groups and what you owe or are owed in each",
  "Expenses and the history behind your balance",
  "Your Me spending and budgets",
];
const CANNOT = ["Add, change or delete anything", "Record or make payments", "See anyone's phone number or email"];

/**
 * Supabase Auth's OAuth 2.1 server sends people here (Authentication › OAuth Server › authorization
 * path) when Claude or another MCP client asks to read their Kotasa. The proxy sends logged-out
 * people to /login first and back here with the authorization_id.
 */
export default function ConsentPage(props: PageProps<"/oauth/consent">) {
  return (
    <AuthShell title="Use Kotasa in Claude" sub="An app wants to read your Kotasa.">
      <Suspense fallback={<Loading />}>
        <Consent searchParams={props.searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function Consent({ searchParams }: { searchParams: PageProps<"/oauth/consent">["searchParams"] }) {
  const sp = await searchParams;
  const id = typeof sp.authorization_id === "string" ? sp.authorization_id : "";
  const failed = sp.error === "failed";
  if (!id) return <Problem text="This link is missing its request. Go back to Claude and connect Kotasa again." />;

  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) return <Problem text="This request has expired or was already answered. Go back to Claude and connect Kotasa again." />;
  // Allowed before for the same access: Supabase answers with where to go straight away.
  if (!("authorization_id" in data)) redirect(data.redirect_url);
  const req = data as OAuthAuthorizationDetails;

  const app = req.client.name || "An app";
  const allowed = mcpAllowed(profile);
  let host = "";
  try {
    host = req.client.uri ? new URL(req.client.uri).host : new URL(req.redirect_uri).host;
  } catch {
    /* no usable address */
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-lg font-semibold">{app}</p>
        {host && <p className="text-sm text-muted">{host}</p>}
        <p className="mt-2 text-sm">
          wants to read your Kotasa as <span className="font-semibold">{profile.full_name}</span>.
        </p>
      </div>

      <div className="space-y-2 text-sm">
        <p className="font-semibold">It can see</p>
        <ul className="space-y-1.5">
          {CAN.map((t) => (
            <li key={t} className="flex items-start gap-2">
              <Eye size={16} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
        <p className="pt-2 font-semibold">It can&apos;t</p>
        <ul className="space-y-1.5">
          {CANNOT.map((t) => (
            <li key={t} className="flex items-start gap-2 text-muted">
              <ProhibitInset size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      {failed && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          That didn&apos;t go through. Try again, or go back to Claude and connect Kotasa again.
        </p>
      )}
      {!allowed.ok && (
        <p role="alert" className="rounded-xl bg-amber-soft px-3 py-2 text-sm text-amber-ink">
          {allowed.message}
        </p>
      )}

      <form action={decideOAuth} className="grid grid-cols-2 gap-2">
        <input type="hidden" name="authorization_id" value={req.authorization_id} />
        <button name="decision" value="deny" className="btn-ghost">
          Don&apos;t allow
        </button>
        <button name="decision" value="allow" className="btn-primary" disabled={!allowed.ok}>
          <CheckCircle size={16} weight="bold" aria-hidden="true" /> Allow
        </button>
      </form>
      <p className="text-xs text-muted">You can turn this off any time in Me › Settings.</p>
    </div>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
      {text}
    </p>
  );
}
