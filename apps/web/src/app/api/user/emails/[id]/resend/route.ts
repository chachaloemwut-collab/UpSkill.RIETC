import { route } from "@/server/http";
import { resendVerificationForSecondaryEmail } from "@/server/auth/user-emails.service";

export const POST = route<never, { id: string }>({ auth: "required" }, async ({ params, user }) => {
  await resendVerificationForSecondaryEmail(user!.id, params.id);
  return { ok: true };
});
