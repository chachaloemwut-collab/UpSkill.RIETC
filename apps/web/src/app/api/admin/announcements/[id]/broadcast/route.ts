import { route } from "@/server/http";
import { broadcastAnnouncement } from "@/server/programs/announcements.service";
import { uuidParam } from "@/server/params";

export const POST = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params, user, ip }) => broadcastAnnouncement(user!, uuidParam(params.id), { ip }));
