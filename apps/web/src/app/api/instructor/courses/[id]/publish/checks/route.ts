import { route } from "@/server/http";
import { getPublishReadiness } from "@/server/courses/instructor.service";
import { uuidParam } from "@/server/params";

export const GET = route<never, { id: string }>(
  { auth: "required", roles: ["instructor", "admin"] },
  async ({ params, user }) => {
    return getPublishReadiness(user!, uuidParam(params.id));
  },
);
