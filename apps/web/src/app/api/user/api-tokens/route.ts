import { z } from "zod";
import { route } from "@/server/http";
import { createApiToken, listApiTokens, revokeApiToken } from "@/server/account/api-tokens.service";

const CreateBody = z.strictObject({ name: z.string().trim().min(1).max(120) });

export const POST = route<typeof CreateBody>({ auth: "required", body: CreateBody }, async ({ body, user }) => {
  const { id, token } = await createApiToken(user!.id, body.name);
  return { id, token, name: body.name.trim().slice(0, 120) };
});

export const GET = route({ auth: "required" }, async ({ user }) => ({ tokens: await listApiTokens(user!.id) }));

const RevokeBody = z.strictObject({ id: z.uuid() });

export const DELETE = route<typeof RevokeBody>({ auth: "required", body: RevokeBody }, async ({ body, user }) => {
  await revokeApiToken(user!, body.id);
  return { ok: true };
});
