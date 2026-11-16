import { route } from "@/server/http";
import { revokeInstructorInvitation } from "@/server/admin/invitations.service";
import { uuidParam } from "@/server/params";

export const POST = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params, user, ip }) => {
  await revokeInstructorInvitation(user!.id, uuidParam(params.id), { ip });
  return { ok: true };
});
