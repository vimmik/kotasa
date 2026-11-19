# Kotasa in Claude (MCP connector)

Kavi, 2026-11-19: **read-only first**, **no payments**, **everyone can use it for now**; later only people on a plan
(change `mcpAllowed()` in `src/lib/mcp/auth.ts`).

## How it fits together
- `POST /api/mcp`: MCP server (Streamable HTTP, stateless, JSON answers). `src/app/api/mcp/route.ts`.
- Tools: `src/lib/mcp/tools.ts`. All read-only (`readOnlyHint`): `list_groups`, `group_balances`, `list_expenses`,
  `get_expense`, `my_history`, `across_groups`, `me_spending`, `me_budgets`. Same checks as the app:
  `orgContextFor(profile, slug)` + active member, `getPairs` for balances, `orgDb` / `meDb` only. Never returns
  phone numbers or emails. Bank details only of people the caller owes (same rule as Home).
- Login: **Supabase Auth's OAuth 2.1 server** issues the tokens. No own token tables.
  1. Claude calls `/api/mcp` with no token → 401 + `WWW-Authenticate: Bearer resource_metadata=...`.
  2. `/.well-known/oauth-protected-resource/api/mcp` names `https://<ref>.supabase.co/auth/v1` as the
     authorization server.
  3. Claude registers itself (dynamic client registration) and sends the person to Supabase, which sends them to
     **`/oauth/consent`** (log in first if needed; the proxy keeps the `authorization_id` in `?next=`).
  4. Allow → `approveAuthorization` → back to Claude with a code → Claude gets a Supabase JWT for that person.
  5. `/api/mcp` checks it with `getClaims()` and maps `sub` → `profile_logins` → profile.
- Me › Settings › "Use Kotasa in Claude": the link to paste, and connected apps with "Turn off" (`revokeGrant`).
- The token is a normal Supabase user JWT. Against Supabase's own APIs it can read nothing: RLS is on with no policies.

## Setup (each Supabase project: dev, QA, prod)
1. Dashboard → Authentication → **OAuth Server**: enable it.
2. Authorization path: `/oauth/consent`. Site URL must be the app's URL (Authentication → URL Configuration).
3. Allow **dynamic client registration** (Claude registers itself).
4. Recommended: asymmetric JWT signing keys (JWT Keys), so `getClaims()` verifies locally via JWKS.
5. In Claude: Settings → Connectors → Add custom connector → `https://<app>/api/mcp` → Connect → Allow.

## Not done yet (ask Kavi first)
- Writes (add an expense, Me quick add). Payments stay out.
- Plan gating (`mcpAllowed`).
