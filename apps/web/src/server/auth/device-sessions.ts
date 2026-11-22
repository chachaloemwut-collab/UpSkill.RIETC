import "server-only";
import { ctx } from "../context";
import { audit } from "../audit";
import { HttpError } from "../http";
import type { CurrentUser } from "./session";

export async function listMyDevices(user: CurrentUser) {
  const now = new Date();
  return ctx().db.selectFrom("user_sessions").select(["id", "user_agent", "last_seen_at"])
    .where("user_id", "=", user.id).where("revoked_at", "is", null)
    .where("expires_at", ">", now).where("idle_expires_at", ">", now)
    .orderBy("last_seen_at", "desc").execute();
}

export async function disconnectDevice(actor: CurrentUser, targetId: string, sessionId: string, ip: string) {
  const now = new Date();
  await ctx().db.transaction().execute(async trx => {
    if (targetId !== actor.id) {
      if (actor.role !== "admin") throw new HttpError(403, "FORBIDDEN");
      const target = await trx.selectFrom("users").select("is_system_owner").where("id", "=", targetId).executeTakeFirst();
      if (!target || target.is_system_owner) throw new HttpError(403, "FORBIDDEN");
    }
    if (sessionId === actor.sessionId) throw new HttpError(409, "CURRENT_SESSION", "กรุณาใช้เมนูออกจากระบบสำหรับอุปกรณ์นี้");
    const result = await trx.updateTable("user_sessions").set({ revoked_at: now, revoked_reason: "device_logout" })
      .where("user_id", "=", targetId).where("id", "=", sessionId).where("revoked_at", "is", null)
      .where("expires_at", ">", now).where("idle_expires_at", ">", now).executeTakeFirst();
    if (!result.numUpdatedRows) throw new HttpError(404, "NOT_FOUND", "ไม่พบการเข้าสู่ระบบที่ยังใช้งานอยู่");
    await audit(trx, { action: "user.sessions_revoked", userId: actor.id, entityType: "user", entityId: targetId, ip, details: { sessionId } });
  });
}
