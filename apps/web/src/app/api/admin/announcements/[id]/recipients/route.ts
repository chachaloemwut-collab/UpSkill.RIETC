import { route } from "@/server/http";
import { getAnnouncementRecipientCount } from "@/server/programs/announcements.service";
import { uuidParam } from "@/server/params";

export const GET = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params, user }) =>
  getAnnouncementRecipientCount(user!, uuidParam(params.id)),
);
