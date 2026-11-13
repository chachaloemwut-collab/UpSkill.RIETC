import { z } from "zod";
import { route, HttpError } from "@/server/http";
import { startLearningSession } from "@/server/learning/start-session.service";

export const POST = route<z.ZodNever, { id: string }>({ auth: "required" }, async ({ params, user, ip, userAgent }) => {
  if (!z.uuid().safeParse(params.id).success) throw new HttpError(404, "NOT_FOUND");
  return startLearningSession({ userId: user!.id, lessonId: params.id, ip, userAgent });
});
