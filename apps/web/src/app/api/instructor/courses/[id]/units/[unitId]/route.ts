import { z } from "zod";
import { route, HttpError } from "@/server/http";
import { deleteUnit, updateUnit } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

type P = { id: string; unitId: string };
const Body = z.strictObject({
  title: z.string().trim().min(1).max(255).optional(),
  summary: z.string().max(20_000).nullable().optional(),
});

export const PATCH = route<typeof Body, P>({ auth: "required", roles: ["instructor", "admin"], body: Body, maxBodyBytes: 64 * 1024 }, async ({ params, body, user }) => {
  if (body.title === undefined && body.summary === undefined) throw new HttpError(400, "NOTHING_TO_UPDATE");
  await updateUnit(user!, uuidParam(params.id), uuidParam(params.unitId), { title: body.title, summary: body.summary });
  return { ok: true };
});

export const DELETE = route<never, P>({ auth: "required", roles: ["instructor", "admin"] }, async ({ params, user }) => {
  await deleteUnit(user!, uuidParam(params.id), uuidParam(params.unitId));
  return { ok: true };
});
