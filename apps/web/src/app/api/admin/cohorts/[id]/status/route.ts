import { z } from "zod";
import { route } from "@/server/http";
import { cancelCohort, publishCohort } from "@/server/programs/cohorts.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({ action: z.enum(["publish", "cancel"]) });

export const PATCH = route<typeof Body, { id: string }>({ auth: "required", roles: ["admin"], body: Body }, async ({ params, body, user, ip }) => {
  const id = uuidParam(params.id);
  if (body.action === "publish") await publishCohort(user!, id, { ip });
  else await cancelCohort(user!, id, { ip });
  return { ok: true };
});
