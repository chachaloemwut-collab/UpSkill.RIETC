import { NextResponse } from "next/server";
import { RATE_LIMITS } from "@upskill/infra/rate-limit";
import { route, HttpError } from "@/server/http";
import { buildGoogleAuthUrl, type OAuthMode } from "@/server/auth/google";

const MODES = new Set<OAuthMode>(["login", "link", "reset"]);

// GET /api/auth/google?mode=login|link|reset
export const GET = route({ auth: "optional", rateLimit: ({ ip }) => [[RATE_LIMITS.loginPerIp, ip]] }, async ({ req, user }) => {
  const mode = (req.nextUrl.searchParams.get("mode") ?? "login") as OAuthMode;
  if (!MODES.has(mode)) throw new HttpError(400, "BAD_MODE");
  if (mode === "link" && !user) throw new HttpError(401, "UNAUTHENTICATED");
  const url = await buildGoogleAuthUrl(mode, mode === "link" ? user!.id : undefined);
  return NextResponse.redirect(url);
});
