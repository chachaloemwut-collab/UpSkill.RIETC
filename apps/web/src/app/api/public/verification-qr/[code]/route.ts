import QRCode from "qrcode";
import { CERTIFICATE_CODE_RE } from "@upskill/core";
import { ctx } from "@/server/context";
import { HttpError, route } from "@/server/http";

export const GET = route<never, { code: string }>({ auth: "none" }, async ({ params }) => {
  const sample = params.code === "sample";
  if (!sample && !CERTIFICATE_CODE_RE.test(params.code)) throw new HttpError(404, "NOT_FOUND");
  const destination = new URL(sample ? "/verify" : "/verify/" + params.code, ctx().env.APP_ORIGIN);
  const png = await QRCode.toBuffer(destination.href, { margin: 4, width: 384, errorCorrectionLevel: "M" });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
});
