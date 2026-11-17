import { DEVELOPER_TEST_EMAIL } from "@upskill/core";
import { HttpError, route } from "@/server/http";
import { issueDeveloperTestCertificate } from "@/server/certificates/developer-test.service";

export const POST = route({ auth: "required" }, async ({ user, ip }) => {
  if (user?.email?.toLowerCase() !== DEVELOPER_TEST_EMAIL) {
    throw new HttpError(403, "FORBIDDEN", "สิทธิ์นี้จำกัดเฉพาะบัญชีผู้พัฒนา cha.chaloemwut@gmail.com เท่านั้น");
  }
  const result = await issueDeveloperTestCertificate({ ip });
  return { ok: true, code: result.code, created: result.created };
});
