import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { resetCourseLearnerQuizAttempts } from "@/server/courses/instructor.service";

export const POST = route<never, { id: string; enrollmentId: string }>(
  { auth: "required", roles: ["instructor", "admin"] },
  async ({ params, user, ip }) => {
    return resetCourseLearnerQuizAttempts(user!, uuidParam(params.id), uuidParam(params.enrollmentId), { ip });
  },
);
