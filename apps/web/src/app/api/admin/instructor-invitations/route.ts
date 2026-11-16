import { z } from "zod";
import { route } from "@/server/http";
import { createInstructorInvitation, listInstructorInvitations } from "@/server/admin/invitations.service";

const Body = z.strictObject({ email: z.email().max(254), message: z.string().trim().max(500).optional() });

export const GET = route({ auth: "required", roles: ["admin"] }, async () => ({ invitations: await listInstructorInvitations() }));

export const POST = route<typeof Body>({ auth: "required", roles: ["admin"], body: Body }, async ({ body, user, ip }) =>
  createInstructorInvitation(user!.id, { email: body.email, message: body.message }, { ip }),
);
