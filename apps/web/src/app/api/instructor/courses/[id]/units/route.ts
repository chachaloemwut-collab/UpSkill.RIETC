import { z } from "zod";
import { route } from "@/server/http";
import { addUnit } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  title: z.string().trim().min(1).max(255),
  summary: z.string().max(20_000).nullable().optional(),
});

export const POST = route<typeof Body, { id: string }>({ auth: "required", roles: ["instructor", "admin"], body: Body, maxBodyBytes: 64 * 1024 }, async ({ params, body, user }) =>
  addUnit(user!, uuidParam(params.id), { title: body.title, summary: body.summary }),
);
