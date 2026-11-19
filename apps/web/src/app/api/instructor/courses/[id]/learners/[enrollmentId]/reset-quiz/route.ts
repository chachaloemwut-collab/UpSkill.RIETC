import { z } from "zod";
import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { resetCourseLearnerQuizAttempts } from "@/server/courses/instructor.service";

const bodySchema = z.object({
  assessmentType: z.enum(["pre", "lesson", "post"]).optional(),
  lessonId: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
});

export const POST = route<typeof bodySchema, { id: string; enrollmentId: string }>(
  { auth: "required", roles: ["instructor", "admin"], body: bodySchema },
  async ({ params, body, user, ip }) => {
    return resetCourseLearnerQuizAttempts(user!, uuidParam(params.id), uuidParam(params.enrollmentId), { ip }, body);
  },
);
