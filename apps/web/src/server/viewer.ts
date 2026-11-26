import "server-only";
import { cache } from "react";
import { displayName } from "@/lib/format";
import { getCurrentUser } from "./auth/session";
import { ctx } from "./context";

/** The signed-in user plus a display name; memoized per request (layout and page both ask). */
export const getViewer = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const { db } = ctx();
  const row = await db.selectFrom("users as u")
    .leftJoin("user_profiles as p", "p.user_id", "u.id")
    .select(["u.legal_full_name_th", "u.legal_full_name_en", "p.user_id as profileId"])
    .select(eb => eb.exists(eb.selectFrom("management_grants as g").select("g.id")
      .whereRef("g.user_id","=","u.id").where("g.revoked_at","is",null).where("g.starts_at","<=",new Date())
      .where(or => or.or([or("g.expires_at","is",null), or("g.expires_at",">",new Date())]))).as("hasGrant"))
    .where("u.id", "=", user.id).executeTakeFirst();
  return { ...user, name: row?.legal_full_name_th ?? row?.legal_full_name_en ?? displayName(user.username ?? user.email), hasProfile: !!row?.profileId, canManage: user.role === "admin" || !!row?.hasGrant };
});
