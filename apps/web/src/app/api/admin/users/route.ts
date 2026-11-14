import { z } from "zod";
import { route } from "@/server/http";
import { adminUpdateUser } from "@/server/admin/admin.service";
import { listUsersAdmin } from "@/server/admin/users.service";

const Body = z.strictObject({
  email: z.email(),
  role: z.enum(["member", "instructor", "admin"]).optional(),
  status: z.enum(["active", "suspended", "banned"]).optional(),
});

export const PATCH = route<typeof Body>({ auth: "required", roles: ["admin"], body: Body }, async ({ body, user }) => {
  await adminUpdateUser(user!.id, body.email, { role: body.role, status: body.status });
  return { ok: true };
});

// Searchable, filterable, paginated user list
export const GET = route({ auth: "required", roles: ["admin"] }, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  return listUsersAdmin({
    query: sp.get("q") ?? undefined,
    role: sp.get("role") ?? undefined,
    status: sp.get("status") ?? undefined,
    page: Number(sp.get("page") ?? 1),
  });
});
