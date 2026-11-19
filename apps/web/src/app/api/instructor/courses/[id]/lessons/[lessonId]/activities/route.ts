import { z } from "zod";
import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { ActivityTypeEnum, ActivityPolicySchema, createLessonActivity, listLessonActivities } from "@/server/courses/activity.service";

const Body = z.strictObject({
  activity_type: ActivityTypeEnum,
  position_sec: z.number().int().min(0),
  sequence_order: z.number().int().min(0).optional(),
  content: z.record(z.string(), z.unknown()),
  policy: z.record(z.string(), z.unknown()).optional(),
  publish_immediately: z.boolean().optional(),
}).superRefine((val, ctx) => {
  // Validate that content matches the declared activity_type at the API layer too
  const contentSchema = {
    question: z.object({ question: z.string().min(1), options: z.array(z.string().min(1)).min(2), correct_index: z.number().int().min(0) }),
    content: z.object({}).passthrough(),
    pause: z.object({}).passthrough(),
    section: z.object({}).passthrough(),
    summary: z.object({}).passthrough(),
  }[val.activity_type];
  const r = contentSchema?.safeParse(val.content);
  if (r && !r.success) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error.message, path: ["content"] });
  if (val.policy) {
    const rp = ActivityPolicySchema.safeParse(val.policy);
    if (!rp.success) ctx.addIssue({ code: z.ZodIssueCode.custom, message: rp.error.message, path: ["policy"] });
  }
});

type Params = { id: string; lessonId: string };

export const GET = route<never, Params>({ auth: "required", roles: ["instructor", "admin"] }, async ({ user, params }) =>
  listLessonActivities(user!, uuidParam(params.id), uuidParam(params.lessonId)),
);

export const POST = route<typeof Body, Params>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ user, params, body }) =>
  createLessonActivity(user!, uuidParam(params.id), uuidParam(params.lessonId), body),
);
