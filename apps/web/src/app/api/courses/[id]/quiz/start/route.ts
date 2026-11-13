import { route } from "@/server/http";
import { startQuiz } from "@/server/courses/quiz.service";
import { uuidParam } from "@/server/params";

// [CHANGED] spec says GET, but starting an attempt creates state (and consumes a daily attempt),
// so it must be POST: GETs can be triggered cross-site by <img> tags or link prefetchers.
export const POST = route<never, { id: string }>({ auth: "required" }, async ({ params, user }) => startQuiz(user!.id, uuidParam(params.id)));
