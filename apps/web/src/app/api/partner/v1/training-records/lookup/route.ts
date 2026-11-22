import { z } from "zod";
import { partnerRoute } from "@/server/partner/partner-http";
import { lookupTrainingByNationalId } from "@/server/partner/partner.service";

// POST only: the national ID travels in the body, never in a URL (URLs end up in proxy and browser logs)
const Body = z.strictObject({ national_id: z.string().min(13).max(20) });

export const POST = partnerRoute({ endpoint: "training-records.lookup", scope: "training:lookup", body: Body }, async ({ body }) => {
  const result = await lookupTrainingByNationalId(body.national_id);
  return { body: result, matched: result.found, resultCount: result.trainings.length };
});
