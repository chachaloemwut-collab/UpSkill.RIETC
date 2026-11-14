import { route } from "@/server/http";
import { exportRegistrationsCsv } from "@/server/programs/cohorts.service";
import { uuidParam } from "@/server/params";

export const GET = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params, user, ip }) => {
  const { filename, csv } = await exportRegistrationsCsv(user!, uuidParam(params.id), { ip });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
});
