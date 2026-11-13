// Spec 3.2 #2 + [CHANGED]: a client report is only a "signal". The lesson is NOT marked broken right away
// (otherwise anyone could take down another person's course by forging reports). The worker checks
// with the YouTube Data API first, and only marks it broken / notifies the instructor if the video really is broken.
import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { ctx } from "@/server/context";
import { route, HttpError } from "@/server/http";
import { enqueueVideoRecheck } from "@/server/queue";

const Body = z.strictObject({ error_code: z.union([z.literal(2), z.literal(5), z.literal(100), z.literal(101), z.literal(150), z.literal(153)]) });

export const POST = route<typeof Body, { id: string }>(
  { auth: "required", body: Body, maxBodyBytes: 256, rateLimit: ({ user }) => [[RATE_LIMITS.videoReportPerUser, user!.id]] },
  async ({ params, body, user }) => {
    if (!z.uuid().safeParse(params.id).success) throw new HttpError(404, "NOT_FOUND");
    const { db } = ctx();
    // Only learners enrolled in the course may report
    const ok = await db
      .selectFrom("lessons as l")
      .innerJoin("enrollments as e", (j) => j.onRef("e.course_id", "=", "l.course_id").on("e.user_id", "=", user!.id))
      .select("l.id")
      .where("l.id", "=", params.id)
      .executeTakeFirst();
    if (!ok) throw new HttpError(404, "NOT_FOUND");

    await db.insertInto("video_reports").values({ lesson_id: params.id, reporter_id: user!.id, error_code: body.error_code }).execute();
    await enqueueVideoRecheck(params.id);
    return { ok: true };
  },
);
