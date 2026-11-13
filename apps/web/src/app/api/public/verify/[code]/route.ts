import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route } from "@/server/http";
import { verifyPublicCertificate } from "@/server/certificates/verify.service";

// Public (no login), but rate limited by IP to prevent scraping names via code enumeration
export const GET = route<never, { code: string }>(
  { auth: "none", rateLimit: ({ ip }) => [[RATE_LIMITS.verifyPublicPerIp, ip]] },
  async ({ params }) => verifyPublicCertificate(params.code),
);
