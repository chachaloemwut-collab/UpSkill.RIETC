import { route } from "@/server/http";
import { getCertPresets } from "@/server/courses/instructor.service";

export const GET = route({ auth: "required", roles: ["instructor", "admin"] }, async ({ user, req }) => {
  const exclude = req.nextUrl.searchParams.get("exclude") ?? undefined;
  return getCertPresets(user!, exclude);
});
