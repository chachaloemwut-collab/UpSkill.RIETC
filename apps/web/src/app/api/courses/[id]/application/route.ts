import { z } from "zod";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { submitApplication } from "@/server/courses/applications.service";

const text = (max: number) => z.string().max(max).default("");
const Body = z.strictObject({
  contact: z.strictObject({
    phone: text(20), email: text(254), addressLine: text(255), subdistrict: text(100), district: text(100), province: text(100), postalCode: text(10),
  }),
  education: z.strictObject({ level: text(60), institution: text(300), qualification: text(300) }).nullable().optional(),
  occupation: z.strictObject({ occupation: text(60), organization: text(300) }).nullable().optional(),
  guardian: z.strictObject({ name: text(255), relation: text(60), phone: text(20), consent: z.boolean() }).nullable().optional(),
  documents: z.record(z.string().max(40), z.boolean()).default({}),
  declaration: z.strictObject({ signatureName: text(255), accepted: z.boolean() }),
  pdpaConsent: z.boolean(),
});

/** Submit the course application form (ใบสมัคร). Identity comes from the profile; validation is in core. */
export const POST = route<typeof Body, { id: string }>(
  { auth: "required", body: Body, maxBodyBytes: 32 * 1024, rateLimit: ({ user }) => [[RATE_LIMITS.courseApplyPerUser, user!.id]] },
  async ({ params, body, user, ip }) => submitApplication(user!, uuidParam(params.id), body, { ip }),
);
