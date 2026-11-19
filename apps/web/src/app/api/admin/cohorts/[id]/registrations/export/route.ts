import { route } from "@/server/http";
import { exportRegistrationsCsv } from "@/server/programs/cohorts.service";
import { uuidParam } from "@/server/params";

export const GET = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params, user, ip, req }) => {
  const rawCols = req.nextUrl.searchParams.get("cols");
  const cols = rawCols ? rawCols.split(",").filter(Boolean) : undefined;
  const { filename, csv } = await exportRegistrationsCsv(user!, uuidParam(params.id), { ip, cols });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
});
