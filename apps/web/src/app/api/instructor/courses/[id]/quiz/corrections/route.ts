import { route } from "@/server/http";
import { applyCorrections } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

/** Apply all pending score corrections for a course (I-15). */
export const POST = route<never, { id: string }>({ auth: "required", roles: ["instructor", "admin"] }, async ({ params, user, ip }) =>
  applyCorrections(user!, uuidParam(params.id), ip),
);
