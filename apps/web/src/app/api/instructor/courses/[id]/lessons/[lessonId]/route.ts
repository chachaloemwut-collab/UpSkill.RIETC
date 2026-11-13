import { z } from "zod";
import { route, HttpError } from "@/server/http";
import { deleteLesson, renameLesson, replaceLessonVideo } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

type P = { id: string; lessonId: string };
const Body = z.strictObject({
  title: z.string().trim().min(1).max(255).optional(),
  url: z.string().trim().min(5).max(500).optional(),
  dev_duration_sec: z.int().min(1).max(86_400).optional(),
});

export const PATCH = route<typeof Body, P>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ params, body, user }) => {
  const courseId = uuidParam(params.id);
  const lessonId = uuidParam(params.lessonId);
  if (!body.title && !body.url) throw new HttpError(400, "NOTHING_TO_UPDATE");
  if (body.url) await replaceLessonVideo(user!, courseId, lessonId, { url: body.url, devDurationSec: body.dev_duration_sec });
  if (body.title) await renameLesson(user!, courseId, lessonId, body.title);
  return { ok: true };
});

export const DELETE = route<never, P>({ auth: "required", roles: ["instructor", "admin"] }, async ({ params, user }) => {
  await deleteLesson(user!, uuidParam(params.id), uuidParam(params.lessonId));
  return { ok: true };
});
