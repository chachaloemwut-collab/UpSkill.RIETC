import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@upskill/infra/logger";
import { ctx } from "@/server/context";
import { clientIp, HttpError } from "@/server/http";
import { completeGoogleCallback } from "@/server/auth/google";
import { applyGoogleSignIn, linkGoogleToUser } from "@/server/auth/auth.service";
import { getCurrentUser } from "@/server/auth/session";

// Top-level redirect from Google: on failure, send the user to a page with an error code (not JSON)
export async function GET(req: NextRequest) {
  const { env } = ctx();
  const to = (path: string) => NextResponse.redirect(new URL(path, env.APP_ORIGIN));
  const meta = { ip: clientIp(req), userAgent: req.headers.get("user-agent")?.slice(0, 512) ?? "" };

  if (req.nextUrl.searchParams.get("error")) return to("/login?error=GOOGLE_CANCELLED");
  try {
    const { claims, mode, linkUserId } = await completeGoogleCallback(req.nextUrl.searchParams.get("state"), req.nextUrl.searchParams.get("code"));

    if (mode === "link") {
      const user = await getCurrentUser();
      // The flow must finish in the same session that started it
      if (!user || user.id !== linkUserId) throw new HttpError(401, "UNAUTHENTICATED");
      await linkGoogleToUser(user.id, claims, meta);
      return to("/me?linked=google");
    }
    const { redirectTo } = await applyGoogleSignIn(claims, mode, meta);
    return to(redirectTo);
  } catch (err) {
    const code = err instanceof HttpError ? err.code : "GOOGLE_LOGIN_FAILED";
    if (!(err instanceof HttpError)) logger.error({ err }, "google callback failed");
    return to(`/login?error=${encodeURIComponent(code)}`);
  }
}
