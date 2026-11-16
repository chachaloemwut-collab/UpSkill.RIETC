import { route } from "@/server/http";
import { setPrimaryEmail } from "@/server/auth/user-emails.service";

export const POST = route<never, { id: string }>({ auth: "required" }, async ({ params, user, ip }) => {
  await setPrimaryEmail(user!.id, params.id, ip);
  return { ok: true };
});
