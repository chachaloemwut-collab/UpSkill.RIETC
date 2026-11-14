import { route } from "@/server/http";
import { isWatching, unwatchCohort, watchCohort } from "@/server/programs/cohorts.service";
import { uuidParam } from "@/server/params";

export const POST = route<never, { id: string }>({ auth: "required" }, async ({ params, user }) => {
  await watchCohort(user!, uuidParam(params.id));
  return { watching: true };
});

export const DELETE = route<never, { id: string }>({ auth: "required" }, async ({ params, user }) => {
  await unwatchCohort(user!, uuidParam(params.id));
  return { watching: false };
});

export const GET = route<never, { id: string }>({ auth: "required" }, async ({ params, user }) => ({
  watching: await isWatching(user!.id, uuidParam(params.id)),
}));
