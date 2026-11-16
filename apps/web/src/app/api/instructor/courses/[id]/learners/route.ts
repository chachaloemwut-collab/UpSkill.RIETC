import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { listCourseLearners } from "@/server/courses/instructor.service";

export const GET = route<never, { id: string }>({ auth: "required", roles: ["instructor", "admin"] }, async ({ params, user, req }) => {
  const sp = req.nextUrl.searchParams;
  return listCourseLearners(user!, uuidParam(params.id), {
    query: sp.get("q") ?? undefined,
    status: sp.get("status") ?? undefined,
    page: Number(sp.get("page") ?? 1),
    pageSize: Number(sp.get("pageSize") ?? 50),
  });
});
