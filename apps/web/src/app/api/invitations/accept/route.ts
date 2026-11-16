import { z } from "zod";
import { route } from "@/server/http";
import { acceptInstructorInvitation } from "@/server/admin/invitations.service";

const Body = z.strictObject({ token: z.string().min(16).max(256) });

export const POST = route<typeof Body>({ auth: "required", body: Body }, async ({ body, user, ip }) =>
  acceptInstructorInvitation(user!.id, body.token, { ip }),
);
