import { z } from "zod";
import { route } from "@/server/http";
import { issueCertificate } from "@/server/certificates/issue.service";
import { uuidParam } from "@/server/params";

const Body = z.strictObject({ locale: z.enum(["th", "en"]).default("th") });

export const POST = route<typeof Body, { id: string }>({ auth: "required", body: Body }, async ({ params, body, user, ip }) =>
  issueCertificate({ userId: user!.id, courseId: uuidParam(params.id), ip, locale: body.locale }),
);
