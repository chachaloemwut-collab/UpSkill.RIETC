import { route } from "@/server/http";
import { searchUsersForPicker } from "@/server/admin/users.service";

export const GET = route(
  { auth: "required", roles: ["instructor", "admin"] },
  async ({ req }) => {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    return searchUsersForPicker(q);
  },
);
