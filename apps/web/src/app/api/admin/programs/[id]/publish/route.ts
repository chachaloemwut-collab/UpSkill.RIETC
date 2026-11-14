import { z } from "zod";
import { route } from "@/server/http";
import { setProgramVisibility } from "@/server/programs/programs.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({ visibility: z.enum(["draft", "published", "unlisted", "archived"]) });

export const PATCH = route<typeof Body, { id: string }>({ auth: "required", roles: ["admin"], body: Body }, async ({ params, body, user, ip }) => {
  await setProgramVisibility(user!, uuidParam(params.id), body.visibility, { ip });
  return { ok: true };
});
