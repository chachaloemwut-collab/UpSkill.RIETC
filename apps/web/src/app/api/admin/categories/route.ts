import { z } from "zod";
import { route } from "@/server/http";
import { listProgramCategories, renameProgramCategory, deleteProgramCategory } from "@/server/programs/categories.service";

export const GET = route({ auth: "required", roles: ["admin"] }, async ({ user }) =>
  listProgramCategories(user!),
);

const RenameBody = z.strictObject({ from: z.string().trim().min(1).max(60), to: z.string().trim().min(1).max(60) });
export const PATCH = route<typeof RenameBody>({ auth: "required", roles: ["admin"], body: RenameBody }, async ({ user, body }) =>
  renameProgramCategory(user!, body.from, body.to),
);

export const DELETE = route({ auth: "required", roles: ["admin"] }, async ({ user, req }) => {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return Response.json({ error: "MISSING_NAME" }, { status: 400 });
  return deleteProgramCategory(user!, name);
});
