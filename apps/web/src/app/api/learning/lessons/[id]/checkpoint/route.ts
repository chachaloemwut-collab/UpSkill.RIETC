import { z } from "zod";
import { route, HttpError } from "@/server/http";
import { ctx } from "@/server/context";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({ option_index: z.int().min(0).max(20) });

export const POST = route<typeof Body, { id: string }>({ auth: "required", body: Body }, async ({ params, body }) => {
  const lesson = await ctx()
    .db.selectFrom("lessons")
    .select(["checkpoint_correct_index"])
    .where("id", "=", uuidParam(params.id))
    .executeTakeFirst();
  if (!lesson || lesson.checkpoint_correct_index === null) throw new HttpError(404, "NO_CHECKPOINT");
  return { correct: body.option_index === lesson.checkpoint_correct_index };
});
