import "server-only";
import { ctx } from "../context";
import { audit } from "../audit";
import { HttpError } from "../http";
import type { CurrentUser } from "../auth/session";

export async function listProgramCategories(user: CurrentUser) {
  const rows = await ctx()
    .db.selectFrom("programs")
    .select("category")
    .where("category", "is not", null)
    .groupBy("category")
    .orderBy("category")
    .execute();
  return rows.map((r) => r.category as string);
}

export async function renameProgramCategory(user: CurrentUser, from: string, to: string) {
  if (from === to) throw new HttpError(400, "SAME_NAME", "ชื่อใหม่ตรงกับชื่อเดิม");
  const { db } = ctx();
  const res = await db.updateTable("programs").set({ category: to }).where("category", "=", from).executeTakeFirst();
  await audit(db, { action: "programs.category_renamed", userId: user.id, entityType: "system", entityId: "categories", ip: "internal", details: { from, to, affected: Number(res.numUpdatedRows) } });
  return { ok: true, affected: Number(res.numUpdatedRows) };
}

export async function deleteProgramCategory(user: CurrentUser, name: string) {
  const { db } = ctx();
  const res = await db.updateTable("programs").set({ category: null }).where("category", "=", name).executeTakeFirst();
  await audit(db, { action: "programs.category_deleted", userId: user.id, entityType: "system", entityId: "categories", ip: "internal", details: { name, affected: Number(res.numUpdatedRows) } });
  return { ok: true, affected: Number(res.numUpdatedRows) };
}
