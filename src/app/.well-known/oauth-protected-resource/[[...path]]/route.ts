import { originOf, protectedResourceMetadata } from "@/lib/mcp/auth";

/**
 * RFC 9728 protected-resource metadata for the MCP server (/api/mcp). Clients read it from
 * /.well-known/oauth-protected-resource/api/mcp (or without the path) to find the authorization
 * server, which is Supabase Auth's OAuth 2.1 server.
 */
export function GET(request: Request) {
  return Response.json(protectedResourceMetadata(originOf(request)), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
  });
}
