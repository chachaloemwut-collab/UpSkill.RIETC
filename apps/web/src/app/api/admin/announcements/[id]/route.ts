import { route } from "@/server/http";
import { deleteAnnouncement, updateAnnouncement } from "@/server/programs/announcements.service";
import { AnnouncementBody } from "@/server/programs/schemas";
import { uuidParam } from "@/server/params";

export const PATCH = route<typeof AnnouncementBody, { id: string }>({ auth: "required", roles: ["admin"], body: AnnouncementBody, maxBodyBytes: 64 * 1024 }, async ({ params, body, user }) => {
  await updateAnnouncement(user!, uuidParam(params.id), body);
  return { ok: true };
});

export const DELETE = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params, user }) => {
  await deleteAnnouncement(user!, uuidParam(params.id));
  return { ok: true };
});
