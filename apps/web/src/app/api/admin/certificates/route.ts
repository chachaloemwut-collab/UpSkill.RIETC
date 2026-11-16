import { z } from "zod";
import { route } from "@/server/http";
import { listCertificatesAdmin, adminManualIssueCertificate, type AdminCertificateStatus } from "@/server/admin/certificates.service";

const PostBody = z.object({
  userId: z.string().uuid(),
  courseId: z.string().uuid(),
  score: z.number().min(0).max(100).optional(),
  reason: z.string().max(500).optional(),
});

export const GET = route({ auth: "required", roles: ["admin"] }, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  return listCertificatesAdmin({
    query: sp.get("q") ?? undefined,
    status: (sp.get("status") as AdminCertificateStatus) ?? undefined,
    page: Number(sp.get("page") ?? 1),
    pageSize: Number(sp.get("pageSize") ?? 50),
  });
});

export const POST = route<typeof PostBody>({ auth: "required", roles: ["admin"], body: PostBody }, async ({ user, body, ip }) => {
  return adminManualIssueCertificate(user!.id, body, { ip });
});
