import { z } from "zod";
import { route } from "@/server/http";
import { removeEmailSuppression } from "@/server/admin/admin.service";

const Body = z.strictObject({ email: z.email().max(254) });
export const DELETE = route<typeof Body>({ auth: "required", roles: ["admin"], body: Body }, async ({ body }) => {
  await removeEmailSuppression(body.email);
  return { ok: true };
});
