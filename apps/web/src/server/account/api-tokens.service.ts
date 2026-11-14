/**
 * Personal API tokens: used to authenticate MCP clients (Cursor, Claude Desktop, scripts).
 * The plaintext token is generated once and shown once; only its SHA-256 hash is stored.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ctx } from "../context";
import { HttpError } from "../http";
import type { CurrentUser } from "../auth/session";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Generates a token. Returns the plaintext exactly once (never stored or logged). */
export async function createApiToken(userId: string, name: string): Promise<{ id: string; token: string }> {
  const plaintext = `upk_${randomBytes(36).toString("base64url")}`;
  const id = (
    await ctx()
      .db.insertInto("user_api_tokens")
      .values({ user_id: userId, name: name.trim().slice(0, 120) || "mcp", token_hash: hashToken(plaintext) })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
  return { id, token: plaintext };
}

export async function listApiTokens(userId: string) {
  return ctx()
    .db.selectFrom("user_api_tokens")
    .select(["id", "name", "last_used_at", "created_at", "revoked_at"])
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();
}

export async function revokeApiToken(user: CurrentUser, tokenId: string) {
  const r = await ctx()
    .db.updateTable("user_api_tokens")
    .set({ revoked_at: new Date() })
    .where("id", "=", tokenId)
    .where("user_id", "=", user.id)
    .where("revoked_at", "is", null)
    .executeTakeFirst();
  if (Number(r.numUpdatedRows) === 0) throw new HttpError(404, "NOT_FOUND");
}

/** Looks up an active token's owner. Returns null for unknown/revoked tokens. */
export async function userForToken(token: string) {
  const row = await ctx()
    .db.selectFrom("user_api_tokens as t")
    .innerJoin("users as u", "u.id", "t.user_id")
    .select(["u.id", "u.role", "u.status", "u.deleted_at", "u.email", "u.username", "u.is_system_owner", "t.id as token_id"])
    .where("t.token_hash", "=", hashToken(token))
    .where("t.revoked_at", "is", null)
    .executeTakeFirst();
  if (!row || row.status !== "active" || row.deleted_at) return null;
  await ctx().db.updateTable("user_api_tokens").set({ last_used_at: new Date() }).where("id", "=", row.token_id).execute().catch(() => {});
  return { id: row.id, role: row.role as "member" | "instructor" | "admin", isSystemOwner: row.is_system_owner, email: row.email, username: row.username };
}
