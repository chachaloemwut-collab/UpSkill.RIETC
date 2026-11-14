import { NextRequest, NextResponse } from "next/server";
import { dispatchMcp } from "@/server/mcp/mcp";
import { userForToken } from "@/server/account/api-tokens.service";
import { getCurrentUser } from "@/server/auth/session";
import type { McpUser } from "@/server/mcp/tools";

/**
 * MCP Streamable HTTP endpoint.
 *
 * Auth: `Authorization: Bearer upk_...` (personal API token from /me) — the standard way
 * for Cursor / Claude Desktop / scripts. A browser session cookie also works (for testing);
 * that path is safe because every tool is read-only and responses carry no CORS headers.
 * The route intentionally bypasses the CSRF/origin wrapper: MCP clients never send Origin.
 */
export async function POST(req: NextRequest): Promise<Response> {
  let user: McpUser | null = null;
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    user = await userForToken(auth.slice(7).trim());
  }
  if (!user) {
    const session = await getCurrentUser();
    if (session) user = { id: session.id, role: session.role as McpUser["role"], isSystemOwner: session.isSystemOwner, email: session.email, username: session.username };
  }
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }

  const result = await dispatchMcp(user, payload);
  if (result.status === 202) return new NextResponse(null, { status: 202 });
  return NextResponse.json(result.body, { status: result.status, ...(result.headers ?? {}) });
}
