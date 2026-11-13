import { route } from "@/server/http";
import { retryEmailDelivery } from "@/server/admin/admin.service";
import { uuidParam } from "@/server/params";

export const POST = route<never, { id: string }>({ auth: "required", roles: ["admin"] }, async ({ params }) => {
  await retryEmailDelivery(uuidParam(params.id));
  return { ok: true };
});
