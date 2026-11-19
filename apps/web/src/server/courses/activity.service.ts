import "server-only";
import { z } from "zod";
import { ctx } from "../context";
import { HttpError } from "../http";
import { loadOwnedCourse } from "./instructor.service";
import type { CurrentUser } from "../auth/session";

// ── Shared schemas ────────────────────────────────────────────────────────────

export const ActivityTypeEnum = z.enum(["question", "content", "pause", "section", "summary"]);
export type ActivityType = z.infer<typeof ActivityTypeEnum>;

// content / policy shapes per activity_type (kept loose here; stricter at the API boundary)
const QuestionContent = z.object({
  question: z.string().min(1).max(2000),
  options: z.array(z.string().min(1).max(500)).min(2).max(8),
  correct_index: z.number().int().min(0),
  explanation: z.string().max(2000).optional(),
});

const ContentActivityContent = z.object({
  title: z.string().max(255).optional(),
  text: z.string().max(10_000).optional(),
  image_url: z.string().url().optional(),
  link_url: z.string().url().optional(),
});

const ActivityContentByType = {
  question: QuestionContent,
  content: ContentActivityContent,
  pause: z.object({ instruction: z.string().max(500).optional() }),
  section: z.object({ title: z.string().max(255).optional() }),
  summary: z.object({ text: z.string().max(5000).optional() }),
} as const;

export const ActivityPolicySchema = z.object({
  mode: z.enum(["practice", "required", "scored"]).default("required"),
  scoring: z
    .object({
      points: z.number().int().min(0).max(100).default(10),
      penalty_per_wrong: z.number().int().min(0).max(10).default(2),
      max_attempts: z.number().int().min(1).max(10).default(3),
    })
    .optional(),
  on_lock: z
    .object({
      rewatch_sec: z.number().int().min(0).max(3600).default(60),
    })
    .optional(),
  hints: z.array(z.string().max(500)).max(5).optional(),
});

// ── Instructor activity CRUD ──────────────────────────────────────────────────

export async function listLessonActivities(user: CurrentUser, courseId: string, lessonId: string) {
  await loadOwnedCourse(user, courseId);
  const { db } = ctx();
  const lesson = await db.selectFrom("lessons").select("id").where("id", "=", lessonId).where("course_id", "=", courseId).executeTakeFirst();
  if (!lesson) throw new HttpError(404, "LESSON_NOT_FOUND");
  return db
    .selectFrom("lesson_activities")
    .selectAll()
    .where("lesson_id", "=", lessonId)
    .where("is_active", "=", true)
    .orderBy("position_sec", "asc")
    .orderBy("sequence_order", "asc")
    .execute();
}

export type CreateActivityInput = {
  activity_type: ActivityType;
  position_sec: number;
  sequence_order?: number;
  content: Record<string, unknown>;
  policy?: Record<string, unknown>;
  publish_immediately?: boolean;
};

export async function createLessonActivity(user: CurrentUser, courseId: string, lessonId: string, input: CreateActivityInput) {
  await loadOwnedCourse(user, courseId);
  const { db } = ctx();
  const lesson = await db.selectFrom("lessons").select("id").where("id", "=", lessonId).where("course_id", "=", courseId).executeTakeFirst();
  if (!lesson) throw new HttpError(404, "LESSON_NOT_FOUND");

  const schema = ActivityContentByType[input.activity_type];
  const contentParsed = schema.safeParse(input.content);
  if (!contentParsed.success) throw new HttpError(400, "INVALID_CONTENT", contentParsed.error.message);

  const policyParsed = ActivityPolicySchema.safeParse(input.policy ?? {});
  if (!policyParsed.success) throw new HttpError(400, "INVALID_POLICY", policyParsed.error.message);

  const publishNow = input.publish_immediately !== false;
  const values = {
    lesson_id: lessonId,
    activity_type: input.activity_type,
    position_sec: input.position_sec,
    sequence_order: input.sequence_order ?? 0,
    content: JSON.stringify(publishNow ? contentParsed.data : {}),
    policy: JSON.stringify(publishNow ? policyParsed.data : {}),
    draft_content: publishNow ? null : JSON.stringify(contentParsed.data),
    draft_policy: publishNow ? null : JSON.stringify(policyParsed.data),
    published_at: publishNow ? new Date() : null,
  };

  const inserted = await db.insertInto("lesson_activities").values(values).returning("id").executeTakeFirstOrThrow();
  return { id: inserted.id };
}

export type UpdateActivityInput = Partial<{
  position_sec: number;
  sequence_order: number;
  content: Record<string, unknown>;
  policy: Record<string, unknown>;
  save_as_draft: boolean;
}>;

export async function updateLessonActivity(user: CurrentUser, courseId: string, activityId: string, input: UpdateActivityInput) {
  await loadOwnedCourse(user, courseId);
  const { db } = ctx();

  const existing = await db
    .selectFrom("lesson_activities as la")
    .innerJoin("lessons as l", "l.id", "la.lesson_id")
    .select(["la.id", "la.activity_type", "la.published_at"])
    .where("la.id", "=", activityId)
    .where("l.course_id", "=", courseId)
    .executeTakeFirst();
  if (!existing) throw new HttpError(404, "ACTIVITY_NOT_FOUND");

  const patch: Record<string, unknown> = { updated_at: new Date() };

  if (input.position_sec !== undefined) patch.position_sec = input.position_sec;
  if (input.sequence_order !== undefined) patch.sequence_order = input.sequence_order;

  if (input.content !== undefined) {
    const schema = ActivityContentByType[existing.activity_type as ActivityType];
    const parsed = schema.safeParse(input.content);
    if (!parsed.success) throw new HttpError(400, "INVALID_CONTENT", parsed.error.message);
    if (input.save_as_draft) {
      patch.draft_content = JSON.stringify(parsed.data);
    } else {
      patch.content = JSON.stringify(parsed.data);
      patch.published_at = new Date();
      patch.draft_content = null;
    }
  }

  if (input.policy !== undefined) {
    const parsed = ActivityPolicySchema.safeParse(input.policy);
    if (!parsed.success) throw new HttpError(400, "INVALID_POLICY", parsed.error.message);
    if (input.save_as_draft) {
      patch.draft_policy = JSON.stringify(parsed.data);
    } else {
      patch.policy = JSON.stringify(parsed.data);
      patch.draft_policy = null;
    }
  }

  await db.updateTable("lesson_activities").set(patch).where("id", "=", activityId).execute();
  return { ok: true };
}

export async function publishActivityDraft(user: CurrentUser, courseId: string, activityId: string) {
  await loadOwnedCourse(user, courseId);
  const { db } = ctx();
  const existing = await db
    .selectFrom("lesson_activities as la")
    .innerJoin("lessons as l", "l.id", "la.lesson_id")
    .select(["la.id", "la.draft_content", "la.draft_policy"])
    .where("la.id", "=", activityId)
    .where("l.course_id", "=", courseId)
    .executeTakeFirst();
  if (!existing) throw new HttpError(404, "ACTIVITY_NOT_FOUND");
  if (!existing.draft_content && !existing.draft_policy) throw new HttpError(400, "NO_DRAFT");

  const patch: Record<string, unknown> = { published_at: new Date(), updated_at: new Date() };
  if (existing.draft_content) {
    patch.content = JSON.stringify(existing.draft_content);
    patch.draft_content = null;
  }
  if (existing.draft_policy) {
    patch.policy = JSON.stringify(existing.draft_policy);
    patch.draft_policy = null;
  }
  await db.updateTable("lesson_activities").set(patch).where("id", "=", activityId).execute();
  return { ok: true };
}

export async function deleteLessonActivity(user: CurrentUser, courseId: string, activityId: string) {
  await loadOwnedCourse(user, courseId);
  const { db } = ctx();
  const deleted = await db
    .deleteFrom("lesson_activities")
    .using("lessons as l")
    .whereRef("lesson_activities.lesson_id", "=", "l.id")
    .where("l.course_id", "=", courseId)
    .where("lesson_activities.id", "=", activityId)
    .returning("lesson_activities.id")
    .executeTakeFirst();
  if (!deleted) throw new HttpError(404, "ACTIVITY_NOT_FOUND");
  return { ok: true };
}
