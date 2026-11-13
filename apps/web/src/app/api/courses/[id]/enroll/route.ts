import { route } from "@/server/http";
import { enroll } from "@/server/courses/courses.service";
import { uuidParam } from "@/server/params";

export const POST = route<never, { id: string }>({ auth: "required" }, async ({ params, user }) => {
  await enroll(user!, uuidParam(params.id));
  return { ok: true };
});
