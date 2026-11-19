import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ConnectedApp = { clientId: string; name: string; uri: string | null; since: string };

/**
 * Apps the logged-in person let read their Kotasa (Me › Settings). Empty when Supabase's OAuth
 * server isn't switched on yet, so the page never breaks on it.
 */
export async function connectedApps(): Promise<ConnectedApp[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.oauth.listGrants();
    if (error || !data) return [];
    return data.map((g) => ({ clientId: g.client.id, name: g.client.name || "An app", uri: g.client.uri || null, since: g.granted_at }));
  } catch {
    return [];
  }
}
