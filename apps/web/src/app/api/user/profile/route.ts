import { route } from "@/server/http";
import { ProfileBody, getMyProfile, saveMyProfile } from "@/server/auth/profile.service";

const Body = ProfileBody.extend({ pdpaConsent: ProfileBody.shape.guardianConsent });

export const GET = route({ auth: "required" }, async ({ user }) => getMyProfile(user!.id));

export const PUT = route<typeof Body>({ auth: "required", body: Body }, async ({ body, user, ip, userAgent }) => {
  await saveMyProfile(user!.id, body, { ip, userAgent });
  return { ok: true };
});
