import { z } from "zod";
import { route } from "@/server/http";
import { setVisibility } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({ visibility: z.enum(["draft", "published", "unlisted"]) });

export const PATCH = route<typeof Body, { id: string }>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ params, body, user, ip }) => {
  await setVisibility(user!, uuidParam(params.id), body.visibility, { ip });
  return { ok: true };
});
