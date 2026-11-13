import { route } from "@/server/http";
import { removeQuestion } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

export const DELETE = route<never, { id: string; questionId: string }>({ auth: "required", roles: ["instructor", "admin"] }, async ({ params, user }) => {
  await removeQuestion(user!, uuidParam(params.id), uuidParam(params.questionId));
  return { ok: true };
});
