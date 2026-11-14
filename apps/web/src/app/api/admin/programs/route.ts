import { z } from "zod";
import { route } from "@/server/http";
import { createProgram, listProgramsAdmin } from "@/server/programs/programs.service";

const Body = z.strictObject({
  title: z.string().trim().min(3).max(255),
  summary: z.string().trim().max(500).optional(),
  category: z.string().trim().max(60).optional(),
});

export const GET = route({ auth: "required", roles: ["admin"] }, async ({ user }) => ({ programs: await listProgramsAdmin(user!) }));

export const POST = route<typeof Body>({ auth: "required", roles: ["admin"], body: Body }, async ({ body, user, ip }) => createProgram(user!, body, { ip }));
