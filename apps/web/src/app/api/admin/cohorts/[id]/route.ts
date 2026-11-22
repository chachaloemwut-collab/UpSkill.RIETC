import { route } from "@/server/http";
import { deleteDraftCohort, getCohortForAdmin, updateCohort } from "@/server/programs/cohorts.service";
import { CohortBody } from "@/server/programs/schemas";
import { uuidParam } from "@/server/params";

export const GET = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params, user }) => getCohortForAdmin(user!, uuidParam(params.id)));

export const PATCH = route<typeof CohortBody, { id: string }>({ auth: "required", roles: ["admin"], body: CohortBody }, async ({ params, body, user }) => {
  await updateCohort(user!, uuidParam(params.id), body);
  return { ok: true };
});

export const DELETE = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ user, params, ip }) =>
  deleteDraftCohort(user!, uuidParam(params.id), ip));
