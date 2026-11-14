import { z } from "zod";
import { route } from "@/server/http";
import { setAnnouncementVisibility } from "@/server/programs/announcements.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({ visibility: z.enum(["draft", "published", "archived"]) });

export const PATCH = route<typeof Body, { id: string }>({ auth: "required", roles: ["admin"], body: Body }, async ({ params, body, user, ip }) => {
  await setAnnouncementVisibility(user!, uuidParam(params.id), body.visibility, { ip });
  return { ok: true };
});
