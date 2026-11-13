import { z } from "zod";
import { route } from "@/server/http";
import { updateGroupMember } from "@/server/assignments/assignment.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({ email: z.email().max(254), operation: z.enum(["add", "remove"]) });

export const POST = route<typeof Body, { id: string }>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ user, body, params }) => {
  await updateGroupMember(user!, uuidParam(params.id), body.email, body.operation);
  return { ok: true };
});
