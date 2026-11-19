import { z } from "zod";
import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { deleteLessonActivity, updateLessonActivity } from "@/server/courses/activity.service";

const Body = z.strictObject({
  position_sec: z.number().int().min(0).optional(),
  sequence_order: z.number().int().min(0).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  policy: z.record(z.string(), z.unknown()).optional(),
  save_as_draft: z.boolean().optional(),
});

type Params = { id: string; lessonId: string; activityId: string };

export const PATCH = route<typeof Body, Params>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ user, params, body }) =>
  updateLessonActivity(user!, uuidParam(params.id), uuidParam(params.activityId), body),
);

export const DELETE = route<never, Params>({ auth: "required", roles: ["instructor", "admin"] }, async ({ user, params }) =>
  deleteLessonActivity(user!, uuidParam(params.id), uuidParam(params.activityId)),
);
