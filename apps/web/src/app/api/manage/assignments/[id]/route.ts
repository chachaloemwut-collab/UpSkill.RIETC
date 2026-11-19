import { z } from "zod";
import { route } from "@/server/http";
import { updateAssignmentDue } from "@/server/assignments/assignment.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({ dueAt: z.string().datetime().nullable() });

export const PATCH = route<typeof Body, { id: string }>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ user, params, body }) =>
  updateAssignmentDue(user!, uuidParam(params.id), body.dueAt ? new Date(body.dueAt) : null),
);
