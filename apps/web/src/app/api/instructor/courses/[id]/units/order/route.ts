import { z } from "zod";
import { route } from "@/server/http";
import { reorderUnits } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({ unit_ids: z.array(z.uuid()).min(1).max(200) });

export const PUT = route<typeof Body, { id: string }>({ auth: "required", roles: ["instructor", "admin"], body: Body, maxBodyBytes: 16 * 1024 }, async ({ params, body, user }) => {
  await reorderUnits(user!, uuidParam(params.id), body.unit_ids);
  return { ok: true };
});
