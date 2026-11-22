import { uuidParam } from "@/server/params";
import { z } from "zod";
import { route } from "@/server/http";
import { listCertificatesAdmin, nextCertificateBatch, adminManualIssueCertificate, type AdminCertificateStatus } from "@/server/admin/certificates.service";

const PostBody = z.object({
  userId: z.string().uuid(),
  courseId: z.string().uuid(),
  score: z.number().min(0).max(100).optional(),
  reason: z.string().max(500).optional(),
});

export const GET = route({ auth: "required", roles: ["admin"] }, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const after = sp.get("after");
  const course = sp.get("course");
  if (after) return nextCertificateBatch(uuidParam(after), course ? uuidParam(course) : undefined);
  return listCertificatesAdmin({
    courseId: course ? uuidParam(course) : undefined,
    query: sp.get("q") ?? undefined,
    status: (sp.get("status") as AdminCertificateStatus) ?? undefined,
    page: Number(sp.get("page") ?? 1),
    pageSize: Number(sp.get("pageSize") ?? 50),
  });
});

export const POST = route<typeof PostBody>({ auth: "required", roles: ["admin"], body: PostBody }, async ({ user, body, ip }) => {
  return adminManualIssueCertificate(user!.id, body, { ip });
});
