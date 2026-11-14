import { z } from "zod";
import { route } from "@/server/http";
import { decideRegistrations } from "@/server/programs/cohorts.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  ids: z.array(z.uuid()).min(1).max(1000),
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(2000).optional(),
});

export const PATCH = route<typeof Body, { id: string }>({ auth: "required", roles: ["admin"], body: Body, maxBodyBytes: 64 * 1024 }, async ({ params, body, user, ip }) =>
  decideRegistrations(user!, uuidParam(params.id), body, { ip }),
);
