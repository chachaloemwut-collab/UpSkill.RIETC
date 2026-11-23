import { sniffApplicationFile } from "@upskill/core";
import { createApplicationFileStorage } from "@upskill/infra/storage";
import { HttpError, route } from "@/server/http";
import { ctx } from "@/server/context";
import { uuidParam } from "@/server/params";
import { applicationPortrait, enrollmentEvidence } from "@/server/enrollment-evidence";
import { audit } from "@/server/audit";
type Params = { id: string };
const limit = 1024 * 1024;

export const GET = route<never, Params>({ auth: "required" }, async ({ user, params }) => {
  const r = await enrollmentEvidence(user!, uuidParam(params.id));
  const { db, env } = ctx();
  const saved = await db.selectFrom("enrollment_portraits").select(["image_bytes","content_type"]).where("enrollment_id","=",r.id).executeTakeFirst();
  const attached = saved ? null : await applicationPortrait(r.application_id);
  const bytes = saved?.image_bytes ?? (attached ? await createApplicationFileStorage(env).read(attached.storage_key) : null);
  if (!bytes) throw new HttpError(404,"NOT_FOUND");
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type":saved?.content_type ?? attached!.content_type,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox" } });
});
export const POST = route<never, Params>({ auth: "required" }, async ({ user, params, req }) => {
  const r = await enrollmentEvidence(user!, uuidParam(params.id));
  if (r.user_id !== user!.id) throw new HttpError(403,"FORBIDDEN");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400,"EMPTY_FILE");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > limit) { await reader.cancel(); throw new HttpError(413,"FILE_TOO_LARGE"); }
    chunks.push(chunk.value);
  }
  const bytes = Buffer.concat(chunks);
  const type = sniffApplicationFile(bytes);
  if (type !== "image/jpeg" && type !== "image/png") throw new HttpError(415,"UNSUPPORTED_MEDIA_TYPE");
  await ctx().db.transaction().execute(async trx => {
    const owner = await trx.selectFrom("users").select("id").where("id","=",user!.id).where("deleted_at","is",null).forUpdate().executeTakeFirst();
    if (!owner) throw new HttpError(403,"FORBIDDEN");
    const result = await trx.insertInto("enrollment_portraits").values({ enrollment_id:r.id,content_type:type,image_bytes:bytes })
      .onConflict(c=>c.doNothing()).executeTakeFirst();
    if (!result.numInsertedOrUpdatedRows) throw new HttpError(409,"ALREADY_EXISTS");
    await audit(trx,{ userId:user!.id, action:"enrollment.portrait_added",entityType:"enrollment",entityId:r.id });
  });
  return {ok:true};
});
