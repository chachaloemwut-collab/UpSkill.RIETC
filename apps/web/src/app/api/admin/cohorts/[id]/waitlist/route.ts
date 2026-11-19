import { route } from "@/server/http";
import { promoteNextWaitlisted } from "@/server/programs/cohorts.service";
import { uuidParam } from "@/server/params";

export const POST = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params, user }) =>
  promoteNextWaitlisted(user!, uuidParam(params.id)),
);
