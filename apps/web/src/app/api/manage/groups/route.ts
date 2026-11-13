import { z } from "zod";
import { route } from "@/server/http";
import { createLearningGroup } from "@/server/assignments/assignment.service";

const Body = z.strictObject({ name: z.string().trim().min(1).max(255), description: z.string().trim().max(2000).optional() });

export const POST = route<typeof Body>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ user, body }) =>
  createLearningGroup(user!, body),
);
