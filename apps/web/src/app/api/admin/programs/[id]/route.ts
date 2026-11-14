import { z } from "zod";
import { route } from "@/server/http";
import { deleteProgram, updateProgram } from "@/server/programs/programs.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  title: z.string().trim().min(3).max(255).optional(),
  summary: z.string().max(500).nullable().optional(),
  description: z.string().max(20_000).nullable().optional(),
  category: z.string().max(60).nullable().optional(),
});

export const PATCH = route<typeof Body, { id: string }>({ auth: "required", roles: ["admin"], body: Body }, async ({ params, body, user }) => {
  await updateProgram(user!, uuidParam(params.id), Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)));
  return { ok: true };
});

export const DELETE = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params, user, ip }) => {
  await deleteProgram(user!, uuidParam(params.id), { ip });
  return { ok: true };
});
