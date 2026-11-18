import { z } from "zod";
import { route, HttpError } from "@/server/http";
import { deleteLesson, renameLesson, replaceLessonVideo, setLessonCheckpoint, updateLessonDetails, updateLessonPrivacy } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

type P = { id: string; lessonId: string };
const Body = z.strictObject({
  title: z.string().trim().min(1).max(255).optional(),
  url: z.string().trim().min(5).max(500).optional(),
  dev_duration_sec: z.int().min(1).max(86_400).optional(),
  is_public: z.boolean().optional(),
  checkpoint: z
    .strictObject({
      question: z.string().trim().min(1).max(1000),
      options: z.array(z.string().trim().min(1).max(300)).min(2).max(6),
      correct_index: z.int().min(0).max(5),
      at_sec: z.int().min(1).max(86_400),
    })
    .nullable()
    .optional(),
  unit_id: z.uuid().nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  learner_note: z.string().max(2000).nullable().optional(),
});

export const PATCH = route<typeof Body, P>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ params, body, user }) => {
  const courseId = uuidParam(params.id);
  const lessonId = uuidParam(params.lessonId);
  const detailsChanged = body.unit_id !== undefined || body.description !== undefined || body.learner_note !== undefined;
  if (!body.title && !body.url && body.checkpoint === undefined && body.is_public === undefined && !detailsChanged) throw new HttpError(400, "NOTHING_TO_UPDATE");
  if (detailsChanged) {
    await updateLessonDetails(user!, courseId, lessonId, { unitId: body.unit_id, description: body.description, learnerNote: body.learner_note });
  }
  if (body.url) await replaceLessonVideo(user!, courseId, lessonId, { url: body.url, devDurationSec: body.dev_duration_sec, isPublic: body.is_public });
  if (body.title) await renameLesson(user!, courseId, lessonId, body.title);
  if (body.is_public !== undefined && !body.url) await updateLessonPrivacy(user!, courseId, lessonId, body.is_public);
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
