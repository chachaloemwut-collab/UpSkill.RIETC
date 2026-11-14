import { route } from "@/server/http";
import { myRegistrations } from "@/server/programs/cohorts.service";

export const GET = route({ auth: "required" }, async ({ user }) => ({ registrations: await myRegistrations(user!.id) }));
