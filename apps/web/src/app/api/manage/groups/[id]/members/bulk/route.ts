import { z } from "zod";
import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { bulkImportGroupMembers } from "@/server/assignments/assignment.service";

const Body = z.strictObject({
  emails: z.array(z.string().max(254)).max(500),
  preview: z.boolean().default(true),
});

/**
 * Bulk-import members from an email list.
 * preview: true (default) — validate and return per-row status without committing.
 * preview: false — commit the additions.
 * Idempotent: existing members are reported as "already_member" and skipped.
 */
export const POST = route<typeof Body, { id: string }>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ user, body, params }) => {
  return bulkImportGroupMembers(user!, uuidParam(params.id), body.emails, { preview: body.preview });
});
