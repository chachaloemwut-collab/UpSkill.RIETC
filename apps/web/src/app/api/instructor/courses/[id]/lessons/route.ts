import { z } from "zod";
import { route } from "@/server/http";
import { addLesson } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  url: z.string().trim().min(5).max(500),
  title: z.string().trim().max(255).optional(),
  dev_duration_sec: z.int().min(1).max(86_400).optional(), // only honoured outside production without a YouTube key
  is_public: z.boolean().optional(),
});

export const POST = route<typeof Body, { id: string }>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ params, body, user }) =>
  addLesson(user!, uuidParam(params.id), { url: body.url, title: body.title, devDurationSec: body.dev_duration_sec, isPublic: body.is_public }),
);
