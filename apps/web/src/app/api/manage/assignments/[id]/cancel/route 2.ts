import { route } from "@/server/http";
import { cancelAssignment } from "@/server/assignments/assignment.service";
import { uuidParam } from "@/server/params";

export const POST = route<never, { id: string }>({ auth: "required", roles: ["instructor", "admin"] }, async ({ user, params, ip }) => {
  await cancelAssignment(user!, uuidParam(params.id), ip);
  return { ok: true };
});
