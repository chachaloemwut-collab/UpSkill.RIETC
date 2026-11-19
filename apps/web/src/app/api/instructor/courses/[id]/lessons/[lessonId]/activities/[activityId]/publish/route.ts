import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { publishActivityDraft } from "@/server/courses/activity.service";

type Params = { id: string; lessonId: string; activityId: string };

export const POST = route<never, Params>({ auth: "required", roles: ["instructor", "admin"] }, async ({ user, params }) =>
  publishActivityDraft(user!, uuidParam(params.id), uuidParam(params.activityId)),
);
