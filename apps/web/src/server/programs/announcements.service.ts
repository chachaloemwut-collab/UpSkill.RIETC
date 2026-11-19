/** Public announcements (events, news, notices) written by admins, plus an opt-in email broadcast. */
import "server-only";
import { sql } from "@upskill/db";
import { emailCategory, type EmailJob } from "@upskill/infra/mailer";
import { ctx } from "../context";
import { HttpError } from "../http";
import { audit } from "../audit";
import { slugify } from "../slug";
import type { CurrentUser } from "../auth/session";
import { assertAdmin } from "./shared";

export type AnnouncementKind = "event" | "news" | "notice";
export type AnnouncementVisibility = "draft" | "published" | "archived";

export interface AnnouncementInput {
  title: string;
  summary: string | null;
  body: string;
  kind: AnnouncementKind;
  programId: string | null;
  cohortId: string | null;
  location: string | null;
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
  publishAt: Date;
  expiresAt: Date | null;
  isPinned: boolean;
  scheduledBroadcastAt: Date | null;
}

function checkInput(i: AnnouncementInput) {
  const problems: string[] = [];
  if (i.eventEndsAt && !i.eventStartsAt) problems.push("กรุณาระบุวันเริ่มกิจกรรม");
  if (i.eventStartsAt && i.eventEndsAt && i.eventEndsAt < i.eventStartsAt) problems.push("วันสิ้นสุดกิจกรรมต้องไม่ก่อนวันเริ่ม");
  if (i.expiresAt && i.expiresAt <= i.publishAt) problems.push("วันหมดอายุประกาศต้องอยู่หลังวันเผยแพร่");
  if (i.cohortId && !i.programId) problems.push("เลือกหลักสูตรรวมก่อนกำหนดรอบ");
  if (problems.length) throw new HttpError(422, "ANNOUNCEMENT_INVALID", problems.join(" · "));
}

const columns = (i: AnnouncementInput) => ({
  title: i.title.trim(),
  summary: i.summary?.trim() || null,
  body: i.body.trim(),
  kind: i.kind,
  program_id: i.programId,
  cohort_id: i.cohortId,
  location: i.location?.trim() || null,
  event_starts_at: i.eventStartsAt,
  event_ends_at: i.eventEndsAt,
  publish_at: i.publishAt,
  expires_at: i.expiresAt,
  is_pinned: i.isPinned,
  scheduled_broadcast_at: i.scheduledBroadcastAt,
});

async function checkProgram(programId: string | null) {
  if (!programId) return;
  const p = await ctx().db.selectFrom("programs").select("id").where("id", "=", programId).executeTakeFirst();
  if (!p) throw new HttpError(404, "NOT_FOUND");
}

export async function listAnnouncementsAdmin(user: CurrentUser) {
  assertAdmin(user);
  return ctx()
    .db.selectFrom("announcements as a")
    .leftJoin("programs as p", "p.id", "a.program_id")
    .select(["a.id", "a.slug", "a.title", "a.kind", "a.visibility", "a.is_pinned", "a.publish_at", "a.expires_at", "a.event_starts_at", "a.broadcast_at", "a.updated_at", "p.title as program_title"])
    .orderBy("a.updated_at", "desc")
    .limit(500)
    .execute();
}

export async function getAnnouncementForAdmin(user: CurrentUser, id: string) {
  assertAdmin(user);
  const a = await ctx().db.selectFrom("announcements").selectAll().where("id", "=", id).executeTakeFirst();
  if (!a) throw new HttpError(404, "NOT_FOUND");
  return a;
}

export async function createAnnouncement(user: CurrentUser, input: AnnouncementInput) {
  assertAdmin(user);
  checkInput(input);
  await checkProgram(input.programId);
  return ctx()
    .db.insertInto("announcements")
    .values({ ...columns(input), slug: slugify(input.title, "news"), created_by: user.id })
    .returning(["id", "slug"])
    .executeTakeFirstOrThrow();
}

export async function updateAnnouncement(user: CurrentUser, id: string, input: AnnouncementInput) {
  assertAdmin(user);
  checkInput(input);
  await checkProgram(input.programId);
  const r = await ctx().db.updateTable("announcements").set(columns(input)).where("id", "=", id).executeTakeFirst();
  if (Number(r.numUpdatedRows) === 0) throw new HttpError(404, "NOT_FOUND");
}

export async function setAnnouncementVisibility(user: CurrentUser, id: string, visibility: AnnouncementVisibility, meta: { ip: string }) {
  assertAdmin(user);
  const { db } = ctx();
  const r = await db.updateTable("announcements").set({ visibility }).where("id", "=", id).executeTakeFirst();
  if (Number(r.numUpdatedRows) === 0) throw new HttpError(404, "NOT_FOUND");
  if (visibility === "published") await audit(db, { action: "announcement.published", userId: user.id, entityType: "announcement", entityId: id, ip: meta.ip });
}

export async function deleteAnnouncement(user: CurrentUser, id: string) {
  assertAdmin(user);
  const r = await ctx().db.deleteFrom("announcements").where("id", "=", id).where("broadcast_at", "is", null).executeTakeFirst();
  // Once emailed, an announcement stays (archive it instead) so the link in people's inbox keeps a record
  if (Number(r.numDeletedRows) === 0) throw new HttpError(409, "ANNOUNCEMENT_BROADCAST", "ประกาศที่ส่งอีเมลแล้วลบไม่ได้ ใช้การเก็บเข้าคลังแทน");
}

/** Returns the number of users who would receive this announcement's broadcast email. */
export async function getAnnouncementRecipientCount(user: CurrentUser, id: string) {
  assertAdmin(user);
  const { db } = ctx();
  const a = await db.selectFrom("announcements").select(["cohort_id"]).where("id", "=", id).executeTakeFirst();
  if (!a) throw new HttpError(404, "NOT_FOUND");
  let q = db
    .selectFrom("users as u")
    .leftJoin("email_preferences as ep", "ep.user_id", "u.id")
    .select(sql<number>`count(*)::int`.as("n"))
    .where("u.status", "=", "active")
    .where("u.email_verified_at", "is not", null)
    .where("u.is_system_owner", "=", false)
    .where(sql<boolean>`coalesce(ep.course_updates_enabled, true)`);
  if (a.cohort_id) {
    q = q.where((eb) =>
      eb.exists(
        eb.selectFrom("cohort_registrations as cr")
          .select("cr.id")
          .where("cr.cohort_id", "=", a.cohort_id!)
          .where("cr.status", "=", "approved")
          .whereRef("cr.user_id", "=", "u.id"),
      ),
    );
  }
  const r = await q.executeTakeFirstOrThrow();
  return { count: r.n };
}

/**
 * Email a published announcement once. If the announcement has a cohort_id, only approved
 * registrants of that cohort receive it. Category "course_update": the worker skips users
 * who turned course updates off and addresses on the suppression list.
 */
export async function broadcastAnnouncement(user: CurrentUser | null, id: string, meta: { ip: string }) {
  if (user) assertAdmin(user);
  const { db, env } = ctx();
  const a = await db.selectFrom("announcements").selectAll().where("id", "=", id).executeTakeFirst();
  if (!a) throw new HttpError(404, "NOT_FOUND");
  if (a.visibility !== "published" || a.publish_at > new Date()) throw new HttpError(409, "ANNOUNCEMENT_NOT_PUBLISHED", "เผยแพร่ประกาศก่อนส่งอีเมล");
  if (a.broadcast_at) throw new HttpError(409, "ANNOUNCEMENT_ALREADY_BROADCAST", "ส่งอีเมลประกาศนี้ไปแล้ว");

  const link = `${env.APP_ORIGIN}/announcements/${a.slug}`;
  const summary = a.summary ?? a.body.slice(0, 300);
  const queued = await db.transaction().execute(async (trx) => {
    // Claim the broadcast first: a double click can't send twice
    const claimed = await trx.updateTable("announcements").set({ broadcast_at: new Date() }).where("id", "=", id).where("broadcast_at", "is", null).executeTakeFirst();
    if (Number(claimed.numUpdatedRows) === 0) throw new HttpError(409, "ANNOUNCEMENT_ALREADY_BROADCAST", "ส่งอีเมลประกาศนี้ไปแล้ว");
    let recipientsQ = trx
      .selectFrom("users as u")
      .leftJoin("email_preferences as ep", "ep.user_id", "u.id")
      .select(["u.id", "u.email", "ep.preferred_locale"])
      .where("u.status", "=", "active")
      .where("u.email_verified_at", "is not", null)
      .where("u.is_system_owner", "=", false)
      .where(sql<boolean>`coalesce(ep.course_updates_enabled, true)`);
    if (a.cohort_id) {
      recipientsQ = recipientsQ.where((eb) =>
        eb.exists(
          eb.selectFrom("cohort_registrations as cr")
            .select("cr.id")
            .where("cr.cohort_id", "=", a.cohort_id!)
            .where("cr.status", "=", "approved")
            .whereRef("cr.user_id", "=", "u.id"),
        ),
      );
    }
    const recipients = await recipientsQ.execute();
    const category = emailCategory("announcement");
    for (let i = 0; i < recipients.length; i += 500) {
      const chunk = recipients.slice(i, i + 500);
      await trx
        .insertInto("email_outbox")
        .values(
          chunk.map((r) => {
            const job: Omit<Extract<EmailJob, { template: "announcement" }>, "template" | "to"> = {
              title: a.title,
              summary,
              link,
              locale: r.preferred_locale === "en" ? "en" : "th",
            };
            return {
              user_id: r.id,
              recipient_email: r.email.trim().toLowerCase(),
              template_key: "announcement",
              template_version: 1,
              payload: JSON.stringify(job),
              deduplication_key: `announcement:${id}:${r.id}`,
              category,
            };
          }),
        )
        .onConflict((oc) => oc.column("deduplication_key").doNothing())
        .execute();
    }
    return recipients.length;
  });
  if (user) await audit(db, { action: "announcement.broadcast", userId: user.id, entityType: "announcement", entityId: id, ip: meta.ip, details: { recipients: queued } });
  return { queued };
}

/** Process all scheduled broadcasts that are due now. Called by worker cron. */
export async function processScheduledBroadcasts(meta: { ip: string }) {
  const { db } = ctx();
  const due = await db
    .selectFrom("announcements")
    .select("id")
    .where("visibility", "=", "published")
    .where("broadcast_at", "is", null)
    .where("scheduled_broadcast_at", "is not", null)
    .where("scheduled_broadcast_at", "<=", new Date())
    .execute();
  const results: Array<{ id: string; queued?: number; error?: string }> = [];
  for (const { id } of due) {
    try {
      const r = await broadcastAnnouncement(null, id, meta);
      results.push({ id, queued: r.queued });
    } catch (e) {
      results.push({ id, error: e instanceof Error ? e.message : "unknown" });
    }
  }
  return results;
}

// ---------------------------------------------------------------- public

const live = sql<boolean>`a.visibility = 'published' and a.publish_at <= now() and (a.expires_at is null or a.expires_at > now())`;

export async function listPublicAnnouncements(opts: { limit?: number; kind?: AnnouncementKind } = {}) {
  return ctx()
    .db.selectFrom("announcements as a")
    .leftJoin("programs as p", (j) => j.onRef("p.id", "=", "a.program_id").on("p.visibility", "=", "published"))
    .select(["a.id", "a.slug", "a.title", "a.summary", "a.kind", "a.location", "a.event_starts_at", "a.event_ends_at", "a.publish_at", "a.is_pinned", "p.slug as program_slug", "p.title as program_title"])
    .where(live)
    .$if(!!opts.kind, (q) => q.where("a.kind", "=", opts.kind!))
    .orderBy("a.is_pinned", "desc")
    .orderBy("a.publish_at", "desc")
    .limit(opts.limit ?? 100)
    .execute();
}

/** Admins may preview drafts and scheduled announcements; everyone else sees live ones only */
export async function getAnnouncementForViewer(slug: string, user: CurrentUser | null) {
  const a = await ctx()
    .db.selectFrom("announcements as a")
    .leftJoin("programs as p", (j) => j.onRef("p.id", "=", "a.program_id").on("p.visibility", "in", ["published", "unlisted"]))
    .select([
      "a.id", "a.slug", "a.title", "a.summary", "a.body", "a.kind", "a.location", "a.event_starts_at", "a.event_ends_at", "a.publish_at", "a.expires_at", "a.visibility",
      "p.slug as program_slug", "p.title as program_title",
      live.as("is_live"),
    ])
    .where("a.slug", "=", slug)
    .executeTakeFirst();
  if (!a) return null;
  if (!a.is_live && user?.role !== "admin") return null;
  return a;
}
