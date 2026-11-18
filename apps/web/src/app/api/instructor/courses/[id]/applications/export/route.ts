import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { exportApplicationsCsv } from "@/server/courses/applications.service";

/** CSV of every application of one course (personal data: course managers only, audited). */
export const GET = route<never, { id: string }>({ auth: "required", roles: ["instructor", "admin"] }, async ({ params, user, ip }) => {
  const { csv, filename } = await exportApplicationsCsv(user!, uuidParam(params.id), { ip });
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" },
  });
});
