import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { disconnectDevice } from "@/server/auth/device-sessions";

export const DELETE = route<never, { sessionId: string }>({ auth: "required" }, async ({ user, params, ip }) => {
  await disconnectDevice(user!, user!.id, uuidParam(params.sessionId), ip);
  return { ok: true };
});
