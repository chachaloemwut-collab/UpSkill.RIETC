import "server-only";
import type { CohortState } from "@upskill/core";
import { HttpError } from "../http";
import type { CurrentUser } from "../auth/session";

export function assertAdmin(user: CurrentUser | null): asserts user is CurrentUser {
  if (!user || user.role !== "admin") throw new HttpError(403, "FORBIDDEN");
}

export function cohortTimeline(c: { status: string; registration_opens_at: Date; registration_closes_at: Date; starts_at: Date; ends_at: Date }) {
  return {
    state: c.status as CohortState,
    registrationOpensAt: c.registration_opens_at,
    registrationClosesAt: c.registration_closes_at,
    startsAt: c.starts_at,
    endsAt: c.ends_at,
  };
}

/** Bangkok wall-clock text for emails (the outbox payload is plain text) */
export function formatThaiDateTime(d: Date): string {
  return d.toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Bangkok" });
}
