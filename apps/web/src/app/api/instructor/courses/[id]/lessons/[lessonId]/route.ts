import { z } from "zod";
import { route, HttpError } from "@/server/http";
import { deleteLesson, renameLesson, replaceLessonVideo, setLessonCheckpoint } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

type P = { id: string; lessonId: string };
const Body = z.strictObject({
  title: z.string().trim().min(1).max(255).optional(),
  url: z.string().trim().min(5).max(500).optional(),
  dev_duration_sec: z.int().min(1).max(86_400).optional(),
  checkpoint: z
    .strictObject({
      question: z.string().trim().min(1).max(1000),
      options: z.array(z.string().trim().min(1).max(300)).min(2).max(6),
      correct_index: z.int().min(0).max(5),
      at_sec: z.int().min(1).max(86_400),
    })
    .nullable()
    .optional(),
});

export const PATCH = route<typeof Body, P>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ params, body, user }) => {
  const courseId = uuidParam(params.id);
  const lessonId = uuidParam(params.lessonId);
  if (!body.title && !body.url && body.checkpoint === undefined) throw new HttpError(400, "NOTHING_TO_UPDATE");
  if (body.url) await replaceLessonVideo(user!, courseId, lessonId, { url: body.url, devDurationSec: body.dev_duration_sec });
  if (body.title) await renameLesson(user!, courseId, lessonId, body.title);
  if (body.checkpoint !== undefined) {
    await setLessonCheckpoint(
      user!,
      courseId,
      lessonId,
      body.checkpoint === null ? null : { question: body.checkpoint.question, options: body.checkpoint.options, correctIndex: body.checkpoint.correct_index, atSec: body.checkpoint.at_sec },
    );
  }
  return { ok: true };
});

export const DELETE = route<never, P>({ auth: "required", roles: ["instructor", "admin"] }, async ({ params, user }) => {
  await deleteLesson(user!, uuidParam(params.id), uuidParam(params.lessonId));
  return { ok: true };
});
