import { z } from "zod";
import { route } from "@/server/http";
import { getCertificateDisplay, updateCertificateDisplay } from "@/server/system-settings.service";

export const GET = route({ auth: "required", roles: ["admin"] }, async () => getCertificateDisplay());

const Body = z.strictObject({
  show_signer: z.boolean().optional(),
  issuer_name: z.string().trim().max(160).optional(),
});
export const PATCH = route<typeof Body>({ auth: "required", roles: ["admin"], body: Body }, async ({ user, body }) =>
  updateCertificateDisplay(user!, body),
);
