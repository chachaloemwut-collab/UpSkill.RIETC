import { z } from "zod";
import { route } from "@/server/http";
import { restoreCourseDraft } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({
  audit_log_id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  fields: z.array(z.enum(["title", "description"])).min(1),
});

/**
 * Restore restorable fields (title, description) from a previous audit_log entry (I-23).
 * Does NOT restore: rules, scores, enrollment config, credential config.
 */
export const POST = route<typeof Body, { id: string }>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ params, body, user, ip }) =>
  restoreCourseDraft(user!, uuidParam(params.id), body.audit_log_id, body.fields, ip),
);
