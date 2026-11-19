import { route } from "@/server/http";
import { getCourseHistory } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

/** Return up to 100 recent audit_log entries for this course (I-23). */
export const GET = route<never, { id: string }>({ auth: "required", roles: ["instructor", "admin"] }, async ({ params, user }) =>
  getCourseHistory(user!, uuidParam(params.id)),
);
