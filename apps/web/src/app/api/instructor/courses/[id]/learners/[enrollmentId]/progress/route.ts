import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { getCourseLearnerProgressDetail } from "@/server/courses/instructor.service";

export const GET = route<never, { id: string; enrollmentId: string }>(
  { auth: "required", roles: ["instructor", "admin"] },
  async ({ params, user }) => {
    return getCourseLearnerProgressDetail(user!, uuidParam(params.id), uuidParam(params.enrollmentId));
  },
);
