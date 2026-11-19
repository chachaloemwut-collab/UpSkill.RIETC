import { z } from "zod";
import { route } from "@/server/http";
import { shiftCohortDates } from "@/server/programs/cohorts.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({ days: z.number().int().min(-365).max(365).refine((d) => d !== 0, "จำนวนวันต้องไม่เป็นศูนย์") });

export const POST = route<typeof Body, { id: string }>({ auth: "required", roles: ["admin"], body: Body }, async ({ params, body, user }) =>
  shiftCohortDates(user!, uuidParam(params.id), body.days),
);
