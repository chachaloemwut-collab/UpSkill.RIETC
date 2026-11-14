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
  const [row, profile] = await Promise.all([
    db.selectFrom("users").select(["legal_full_name_th", "legal_full_name_en"]).where("id", "=", user.id).executeTakeFirst(),
    db.selectFrom("user_profiles").select("user_id").where("user_id", "=", user.id).executeTakeFirst(),
  ]);
  return { ...user, name: row?.legal_full_name_th ?? row?.legal_full_name_en ?? displayName(user.username ?? user.email), hasProfile: !!profile };
});
