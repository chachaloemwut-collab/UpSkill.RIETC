import { route } from "@/server/http";
import { removeUserEmail } from "@/server/auth/user-emails.service";

export const DELETE = route<never, { id: string }>({ auth: "required" }, async ({ params, user, ip }) => {
  await removeUserEmail(user!.id, params.id, ip);
  return { ok: true };
});
