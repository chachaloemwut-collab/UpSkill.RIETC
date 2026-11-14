/**
 * Minimal Model Context Protocol (MCP) server over Streamable HTTP (JSON-RPC 2.0).
 *
 * Every tool in the registry declares a minimum role; the client only sees (and may call)
 * the tools its authenticated user's role allows — member < instructor < admin.
 */
import "server-only";
import { logger } from "@upskill/infra/logger";
import { MCP_TOOLS, type McpRole, type McpUser } from "./tools";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
const ROLE_RANK: Record<McpRole, number> = { member: 1, instructor: 2, admin: 3 };

export type McpHttpResult =
  | { status: 200; body: unknown; headers?: Record<string, string> }
  | { status: 202; body: null };

interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export async function dispatchMcp(user: McpUser, payload: unknown): Promise<McpHttpResult> {
  let req: JsonRpcRequest;
  try {
    req = payload as JsonRpcRequest;
    if (req?.jsonrpc !== "2.0" || typeof req.method !== "string") throw new Error("invalid");
  } catch {
    return { status: 200, body: { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } } };
  }

  // JSON-RPC notifications carry no id and expect no response.
  if (req.id === undefined) {
    if (req.method === "notifications/initialized" || req.method === "notifications/cancelled") return { status: 202, body: null };
    return { status: 200, body: { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } } };
  }

  const respond = (result: unknown): McpHttpResult => ({ status: 200, body: { jsonrpc: "2.0", id: req.id, result } });
  const fail = (code: number, message: string): McpHttpResult => ({ status: 200, body: { jsonrpc: "2.0", id: req.id, error: { code, message } } });

  switch (req.method) {
    case "initialize":
      return respond({
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "upskill-rietc", version: "1.0.0" },
      });
    case "ping":
      return respond({});
    case "tools/list": {
      const tools = MCP_TOOLS.filter((t) => ROLE_RANK[user.role] >= ROLE_RANK[t.minRole]).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      return respond({ tools });
    }
    case "tools/call": {
      const name = String(req.params?.name ?? "");
      const tool = MCP_TOOLS.find((t) => t.name === name);
      if (!tool) return fail(-32602, `Unknown tool: ${name}`);
      if (ROLE_RANK[user.role] < ROLE_RANK[tool.minRole]) return fail(-32001, `Tool '${name}' requires role '${tool.minRole}'`);
      try {
        const result = await tool.run(user, (req.params?.arguments ?? {}) as Record<string, unknown>);
        return respond({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (err) {
        const message = err instanceof Error ? err.message.slice(0, 1000) : "tool failed";
        logger.error({ tool: name, err: message }, "mcp tool failed");
        return respond({ content: [{ type: "text", text: `Tool error: ${message}` }], isError: true });
      }
    }
    case "resources/list":
      return respond({ resources: [] });
    case "prompts/list":
      return respond({ prompts: [] });
    default:
      return fail(-32601, `Method not found: ${req.method}`);
  }
}
