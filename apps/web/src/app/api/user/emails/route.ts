import { z } from "zod";
import { route } from "@/server/http";
import { addUserEmail, listUserEmails } from "@/server/auth/user-emails.service";

const AddEmailBody = z.strictObject({
  email: z.string().email().max(254),
});

export const GET = route({ auth: "required" }, async ({ user }) => {
  const emails = await listUserEmails(user!.id);
  return { emails };
});

export const POST = route<typeof AddEmailBody>({ auth: "required", body: AddEmailBody }, async ({ body, user, ip }) => {
  const row = await addUserEmail(user!.id, body.email, ip);
  return { ok: true, email: row };
});
