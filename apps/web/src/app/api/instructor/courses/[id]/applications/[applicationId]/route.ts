import { z } from "zod";
import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { reviewApplication } from "@/server/courses/applications.service";

type P = { id: string; applicationId: string };
const Body = z.strictObject({
  action: z.enum(["approve", "reject"]).optional(),
  verification_status: z.enum(["pending", "verified", "incomplete"]).optional(),
  payment_status: z.enum(["not_required", "pending", "paid", "waived"]).optional(),
  receipt_no: z.string().trim().max(64).nullable().optional(),
  staff_note: z.string().max(2000).nullable().optional(),
  documents_verified: z.record(z.string().max(40), z.boolean().nullable()).optional(),
});

/** Staff section of one application (ส่วนเจ้าหน้าที่): approve/reject, evidence check, payment and receipt. */
export const PATCH = route<typeof Body, P>({ auth: "required", roles: ["instructor", "admin"], body: Body }, async ({ params, body, user, ip }) => {
  await reviewApplication(
    user!,
    uuidParam(params.id),
    uuidParam(params.applicationId),
    {
      action: body.action,
      verificationStatus: body.verification_status,
      paymentStatus: body.payment_status,
      receiptNo: body.receipt_no,
      staffNote: body.staff_note,
      documentsVerified: body.documents_verified,
    },
    { ip },
  );
  return { ok: true };
});
