import { route } from "@/server/http";

export const GET = route({ auth: "optional" }, async ({ user }) =>
  user ? { id: user.id, email: user.email, role: user.role } : { id: null },
);
