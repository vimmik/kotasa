import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { mcpAllowed, originOf, resourceMetadataUrl, verifyBearer } from "@/lib/mcp/auth";
import { createKotasaServer } from "@/lib/mcp/tools";

/**
 * Kotasa's MCP server (Streamable HTTP, stateless): add `<app>/api/mcp` as a custom connector in
 * Claude, ChatGPT or Gemini (Me › Settings has a button for each). Every request carries an OAuth access token from Supabase Auth (see lib/mcp/auth.ts and
 * /oauth/consent); without one the answer is 401 pointing at the protected-resource metadata, which
 * is how the client finds where to log in. Tools are read-only (lib/mcp/tools.ts).
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

function withCors(res: Response) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function jsonError(status: number, message: string, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });
}

async function handle(request: Request) {
  const caller = await verifyBearer(request);
  if (!caller) {
    const metadata = resourceMetadataUrl(originOf(request));
    return jsonError(401, "Log in to Kotasa to connect it.", {
      "WWW-Authenticate": `Bearer resource_metadata="${metadata}"`,
    });
  }
  const allowed = mcpAllowed(caller.profile);
  if (!allowed.ok) return jsonError(403, allowed.message);

  // Stateless: a fresh server and transport per request, plain JSON answers (no open streams).
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = createKotasaServer(caller);
  await server.connect(transport);
  try {
    return withCors(await transport.handleRequest(request));
  } finally {
    void server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
