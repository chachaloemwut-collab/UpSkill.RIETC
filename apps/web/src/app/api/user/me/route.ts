import { route } from "@/server/http";

export const GET = route({ auth: "optional" }, async ({ user }) =>
  user ? { id: user.id, email: user.email, username: user.username, role: user.role, isSystemOwner: user.isSystemOwner } : { id: null },
);
