import "server-only";
import { createClient } from "@supabase/supabase-js";
import { profileForAuthUser } from "@/lib/auth";
import { appUrl } from "@/lib/brand";
import type { Profile } from "@/lib/types";

/**
 * Who is calling the MCP server. Claude (or any MCP client) gets its access token from Supabase
 * Auth's OAuth 2.1 server: the person logs in to Kotasa and approves it on /oauth/consent. The token
 * is a normal Supabase JWT for that person, so it maps to their profile like a browser login does.
 */
export type McpCaller = { profile: Profile; authUserId: string; clientId: string | null };

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");

/** The OAuth authorization server (Supabase Auth). Its metadata is at /.well-known/oauth-authorization-server/auth/v1. */
export function authServerUrl() {
  return `${supabaseUrl()}/auth/v1`;
}

/** This app's public origin, from the request (so preview deployments point at themselves). */
export function originOf(request: Request) {
  const fwdHost = request.headers.get("x-forwarded-host");
  const fwdProto = request.headers.get("x-forwarded-proto");
  if (fwdHost) return `${fwdProto ?? "https"}://${fwdHost}`;
  try {
    return new URL(request.url).origin;
  } catch {
    return appUrl();
  }
}

/** RFC 9728 metadata for the MCP endpoint: which authorization server issues its tokens. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [authServerUrl()],
    bearer_methods_supported: ["header"],
    resource_name: "Kotasa",
    resource_documentation: `${origin}/me/settings`,
  };
}

export function resourceMetadataUrl(origin: string) {
  return `${origin}/.well-known/oauth-protected-resource/api/mcp`;
}

/**
 * Checks a bearer token and returns the profile behind it, or null. getClaims() verifies the
 * signature (JWKS for asymmetric keys, else asks Supabase Auth) and the expiry.
 */
export async function verifyBearer(request: Request): Promise<McpCaller | null> {
  const header = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return null;
  const token = m[1].trim();
  const supabase = createClient(supabaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // A malformed token makes getClaims throw (not return an error); either way it's no login.
  const { data, error } = await supabase.auth.getClaims(token).catch((e: unknown) => ({ data: null, error: e }));
  const claims = data?.claims as (Record<string, unknown> & { sub?: string; role?: string; is_anonymous?: boolean }) | undefined;
  if (error || !claims?.sub || claims.role !== "authenticated" || claims.is_anonymous) return null;
  const profile = await profileForAuthUser(claims.sub);
  if (!profile) return null;
  return { profile, authUserId: claims.sub, clientId: typeof claims.client_id === "string" ? claims.client_id : null };
}

/**
 * Whether this person may use Kotasa from Claude. Everyone for now (Kavi, 2026-11-19); later only
 * people on a paid plan. Change it here: the MCP route answers 403 with this message.
 */
export function mcpAllowed(profile: Profile): { ok: true } | { ok: false; message: string } {
  void profile; // later: profile.plan
  return { ok: true };
}
