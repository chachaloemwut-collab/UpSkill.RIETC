import { z } from "zod";
import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { submitCheckpointAnswer } from "@/server/learning/checkpoint.service";

const Body = z.strictObject({ option_index: z.int().min(0).max(20) });

export const POST = route<typeof Body, { id: string }>({ auth: "required", body: Body }, async ({ params, body, user }) =>
  submitCheckpointAnswer(user!.id, uuidParam(params.id), body.option_index),
);
