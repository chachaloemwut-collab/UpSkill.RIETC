import { z } from "zod";
import { route } from "@/server/http";
import { lockLegalName } from "@/server/auth/auth.service";

const Body = z.strictObject({
  legal_full_name_th: z.string().max(255).optional(),
  legal_full_name_en: z.string().max(255).optional(),
  // The user must tick "ข้าพเจ้ายืนยันว่าชื่อ-นามสกุลนี้ถูกต้อง..." (spec 5.4 #1)
  confirm: z.literal(true),
});

export const POST = route<typeof Body>({ auth: "required", body: Body }, async ({ body, user, ip, userAgent }) => {
  await lockLegalName(user!.id, { nameTh: body.legal_full_name_th, nameEn: body.legal_full_name_en }, { ip, userAgent });
  return { ok: true };
});
