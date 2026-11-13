import { route } from "@/server/http";
import { destroyCurrentSession } from "@/server/auth/session";

export const POST = route({ auth: "optional" }, async () => {
  await destroyCurrentSession();
  return { ok: true };
});
