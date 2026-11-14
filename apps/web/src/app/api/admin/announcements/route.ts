import { route } from "@/server/http";
import { createAnnouncement, listAnnouncementsAdmin } from "@/server/programs/announcements.service";
import { AnnouncementBody } from "@/server/programs/schemas";

export const GET = route({ auth: "required", roles: ["admin"] }, async ({ user }) => ({ announcements: await listAnnouncementsAdmin(user!) }));

export const POST = route<typeof AnnouncementBody>({ auth: "required", roles: ["admin"], body: AnnouncementBody, maxBodyBytes: 64 * 1024 }, async ({ body, user }) =>
  createAnnouncement(user!, body),
);
