import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { disconnectDevice } from "@/server/auth/device-sessions";

export const DELETE = route<never, { id: string; sessionId: string }>({ auth: "required", roles: ["admin"] }, async ({ user, params, ip }) => {
  await disconnectDevice(user!, uuidParam(params.id), uuidParam(params.sessionId), ip);
  return { ok: true };
});
