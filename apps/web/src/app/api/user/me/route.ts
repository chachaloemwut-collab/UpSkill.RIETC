import { route } from "@/server/http";
import { deleteOwnAccount } from "@/server/account/account.service";

export const GET = route({ auth: "optional" }, async ({ user }) =>
  user ? { id: user.id, email: user.email, username: user.username, role: user.role, isSystemOwner: user.isSystemOwner } : { id: null },
);

export const DELETE = route({ auth: "required" }, async ({ user, ip }) => {
  await deleteOwnAccount(user!, { ip });
  return { ok: true };
});
