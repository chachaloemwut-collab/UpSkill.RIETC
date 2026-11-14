import { route } from "@/server/http";
import { createCohort } from "@/server/programs/cohorts.service";
import { CohortBody } from "@/server/programs/schemas";
import { uuidParam } from "@/server/params";

export const POST = route<typeof CohortBody, { id: string }>({ auth: "required", roles: ["admin"], body: CohortBody }, async ({ params, body, user, ip }) =>
  createCohort(user!, uuidParam(params.id), body, { ip }),
);
