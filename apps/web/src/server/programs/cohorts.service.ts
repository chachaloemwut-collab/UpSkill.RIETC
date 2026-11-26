/**
 * Training cohorts: registration window, eligibility, seats, approval and waitlist.
 *
 * Concurrency: every change that can take or free a seat runs in one transaction that first locks the cohort
 * row (SELECT ... FOR UPDATE), so two applicants can never both take the last seat.
 */
import "server-only";
import {
  decideSeat,
  deriveCohortPhase,
  evaluateEligibility,
  normalizeAnswers,
  parseEligibilityRules,
  validateCohortDates,
  type Applicant,
  type EligibilityRules,
} from "@upskill/core";
import { sql, type Database, type JsonValue, type Tx } from "@upskill/db";
import { ctx } from "../context";
import { addEmailToOutbox } from "../email/outbox.service";
import { HttpError } from "../http";
import { audit } from "../audit";
import type { CurrentUser } from "../auth/session";
import { authorizeRecord } from "../management/access";
import { assertAdmin, cohortTimeline, formatThaiDateTime } from "./shared";
import { assertProfileComplete } from "../auth/profile.service";
import { getAutomationFlags } from "../automation.service";

type Executor = Database | Tx;
export type RegistrationStatus = "pending" | "approved" | "rejected" | "waitlisted" | "cancelled";

export interface CohortInput {
  title: string;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  startsAt: Date;
  endsAt: Date;
  capacity: number | null;
  waitlistEnabled: boolean;
  requiresApproval: boolean;
  eligibility: unknown;
  clientUpdatedAt?: Date;
  waitlistAcceptanceHours?: number | null;
}

/** Approved and pending registrations both hold a seat until an admin decides */
export async function seatsTaken(db: Executor, cohortId: string): Promise<number> {
  const r = await db
    .selectFrom("cohort_registrations")
    .select(sql<number>`count(*)::int`.as("n"))
    .where("cohort_id", "=", cohortId)
    .where("status", "in", ["approved", "pending"])
    .executeTakeFirstOrThrow();
  return r.n;
}

export async function applicantProfile(user: Pick<CurrentUser, "id" | "email">): Promise<Applicant> {
  const { db } = ctx();
  const [row, groups, done] = await Promise.all([
    db.selectFrom("users").select(["legal_full_name_th", "legal_full_name_en"]).where("id", "=", user.id).executeTakeFirst(),
    db.selectFrom("learning_group_members").select("group_id").where("user_id", "=", user.id).execute(),
    db.selectFrom("enrollments").select("course_id").where("user_id", "=", user.id).where("status", "=", "completed").execute(),
  ]);
  return {
    email: user.email,
    hasLegalName: !!(row?.legal_full_name_th || row?.legal_full_name_en),
    groupIds: groups.map((g) => g.group_id),
    completedCourseIds: done.map((d) => d.course_id),
  };
}

/** Rules from an admin request: normalized, and every referenced group/course must exist */
async function checkedRules(raw: unknown): Promise<EligibilityRules> {
  const rules = parseEligibilityRules(raw);
  const { db } = ctx();
  if (rules.groupIds.length) {
    const n = await db.selectFrom("learning_groups").select("id").where("id", "in", rules.groupIds).execute();
    if (n.length !== rules.groupIds.length) throw new HttpError(422, "ELIGIBILITY_INVALID", "มีกลุ่มผู้เรียนที่ไม่พบในระบบ");
  }
  if (rules.prerequisiteCourseIds.length) {
    const n = await db.selectFrom("courses").select("id").where("id", "in", rules.prerequisiteCourseIds).execute();
    if (n.length !== rules.prerequisiteCourseIds.length) throw new HttpError(422, "ELIGIBILITY_INVALID", "มีรายวิชาที่กำหนดเป็นพื้นฐานที่ไม่พบในระบบ");
  }
  return rules;
}

function checkDates(input: Pick<CohortInput, "registrationOpensAt" | "registrationClosesAt" | "startsAt" | "endsAt">) {
  const problems = validateCohortDates(input);
  if (problems.length) throw new HttpError(422, "COHORT_DATES_INVALID", problems.join(" · "));
}

async function loadCohort(db: Executor, cohortId: string, lock = false) {
  let q = db.selectFrom("program_cohorts").selectAll().where("id", "=", cohortId);
  if (lock) q = q.forUpdate();
  const c = await q.executeTakeFirst();
  if (!c) throw new HttpError(404, "NOT_FOUND");
  return c;
}

async function loadProgramOf(db: Executor, programId: string) {
  return db.selectFrom("programs").select(["id", "slug", "title", "visibility"]).where("id", "=", programId).executeTakeFirstOrThrow();
}

const programLink = (slug: string) => `${ctx().env.APP_ORIGIN}/programs/${slug}`;

// ---------------------------------------------------------------- admin: cohort lifecycle

export async function createCohort(user: CurrentUser, programId: string, input: CohortInput, meta: { ip: string }) {
  assertAdmin(user);
  checkDates(input);
  const rules = await checkedRules(input.eligibility);
  const { db } = ctx();
  const program = await db.selectFrom("programs").select("id").where("id", "=", programId).executeTakeFirst();
  if (!program) throw new HttpError(404, "NOT_FOUND");
  const c = await db
    .insertInto("program_cohorts")
    .values({
      program_id: programId,
      title: input.title.trim(),
      registration_opens_at: input.registrationOpensAt,
      registration_closes_at: input.registrationClosesAt,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      capacity: input.capacity,
      waitlist_enabled: input.waitlistEnabled,
      requires_approval: input.requiresApproval,
      eligibility: JSON.stringify(rules),
      created_by: user.id,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await audit(db, { action: "cohort.created", userId: user.id, entityType: "cohort", entityId: c.id, ip: meta.ip, details: { programId } });
  return c;
}

/** Only an unused draft may be removed. Locking the parent serializes publication and new references. */
export async function deleteDraftCohort(user: CurrentUser, cohortId: string, ip: string) {
  assertAdmin(user);
  return ctx().db.transaction().execute(async trx => {
    const cohort = await loadCohort(trx, cohortId, true);
    if (cohort.status !== "draft") throw new HttpError(409, "NOT_DRAFT", "ลบได้เฉพาะรอบฉบับร่าง");
    for (const table of ["cohort_registrations", "cohort_watches", "enrollments", "certificates", "announcements"] as const) {
      const linked = await trx.selectFrom(table).select("cohort_id").where("cohort_id", "=", cohortId).limit(1).executeTakeFirst();
      if (linked) throw new HttpError(409, "COHORT_IN_USE", "รอบนี้มีข้อมูลอ้างอิงอยู่ จึงลบไม่ได้");
    }
    await trx.deleteFrom("program_cohorts").where("id", "=", cohortId).execute();
    await audit(trx, { action: "cohort.deleted", userId: user.id, entityType: "cohort", entityId: cohortId, ip, details: { programId: cohort.program_id } });
    return { programId: cohort.program_id };
  });
}

export async function updateCohort(user: CurrentUser, cohortId: string, input: CohortInput) {
  assertAdmin(user);
  checkDates(input);
  const rules = await checkedRules(input.eligibility);
  await ctx()
    .db.transaction()
    .execute(async (trx) => {
      const c = await loadCohort(trx, cohortId, true);
      if (c.status === "cancelled") throw new HttpError(409, "COHORT_CANCELLED");
      if (input.clientUpdatedAt && input.clientUpdatedAt.getTime() !== new Date(c.updated_at).getTime()) {
        throw new HttpError(409, "CONFLICT", "ข้อมูลนี้ถูกแก้ไขโดยผู้ใช้คนอื่นแล้ว กรุณาโหลดหน้าใหม่เพื่อดูข้อมูลล่าสุด");
      }
      if (input.capacity !== null) {
        const approved = await trx
          .selectFrom("cohort_registrations")
          .select(sql<number>`count(*)::int`.as("n"))
          .where("cohort_id", "=", cohortId)
          .where("status", "=", "approved")
          .executeTakeFirstOrThrow();
        if (approved.n > input.capacity) throw new HttpError(409, "CAPACITY_BELOW_APPROVED", `อนุมัติไปแล้ว ${approved.n} คน จึงลดจำนวนที่นั่งให้น้อยกว่านี้ไม่ได้`);
      }
      await trx
        .updateTable("program_cohorts")
        .set({
          title: input.title.trim(),
          registration_opens_at: input.registrationOpensAt,
          registration_closes_at: input.registrationClosesAt,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          capacity: input.capacity,
          waitlist_enabled: input.waitlistEnabled,
          requires_approval: input.requiresApproval,
          eligibility: JSON.stringify(rules),
          ...(input.waitlistAcceptanceHours !== undefined ? { waitlist_acceptance_hours: input.waitlistAcceptanceHours } : {}),
        })
        .where("id", "=", cohortId)
        .execute();
      // More seats (or approval switched off) may let people off the waitlist
      await promoteWaitlist(trx, cohortId);
    });
}

/** Shift all date fields on a cohort by a given number of days. Preserves relative spacing. */
export async function shiftCohortDates(user: CurrentUser, cohortId: string, days: number) {
  assertAdmin(user);
  if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 365) throw new HttpError(422, "INVALID_DAYS", "จำนวนวันต้องเป็นจำนวนเต็มที่ไม่ใช่ศูนย์ และไม่เกิน 365");
  const { db } = ctx();
  const c = await loadCohort(db, cohortId);
  if (c.status === "cancelled") throw new HttpError(409, "COHORT_CANCELLED");
  const ms = days * 86_400_000;
  const shift = (d: Date) => new Date(d.getTime() + ms);
  const newDates = {
    registration_opens_at: shift(c.registration_opens_at),
    registration_closes_at: shift(c.registration_closes_at),
    starts_at: shift(c.starts_at),
    ends_at: shift(c.ends_at),
  };
  checkDates({
    registrationOpensAt: newDates.registration_opens_at,
    registrationClosesAt: newDates.registration_closes_at,
    startsAt: newDates.starts_at,
    endsAt: newDates.ends_at,
  } as CohortInput);
  await db.updateTable("program_cohorts").set(newDates).where("id", "=", cohortId).execute();
  return newDates;
}

export async function publishCohort(user: CurrentUser, cohortId: string, meta: { ip: string }) {
  assertAdmin(user);
  const { db } = ctx();
  const c = await loadCohort(db, cohortId);
  if (c.status === "cancelled") throw new HttpError(409, "COHORT_CANCELLED");
  if (c.status === "published") return;
  const program = await loadProgramOf(db, c.program_id);
  if (program.visibility !== "published" && program.visibility !== "unlisted") {
    throw new HttpError(409, "PROGRAM_NOT_PUBLISHED", "กรุณาเผยแพร่หลักสูตรก่อนเปิดรอบอบรม");
  }
  await db.updateTable("program_cohorts").set({ status: "published", published_at: new Date() }).where("id", "=", cohortId).where("status", "=", "draft").execute();
  await audit(db, { action: "cohort.published", userId: user.id, entityType: "cohort", entityId: cohortId, ip: meta.ip });
}

/** Cancel a cohort: every open registration is cancelled, enrollments it granted are revoked, everyone is told */
export async function cancelCohort(user: CurrentUser, cohortId: string, meta: { ip: string }) {
  assertAdmin(user);
  const { db } = ctx();
  await db.transaction().execute(async (trx) => {
    const c = await loadCohort(trx, cohortId, true);
    if (c.status === "cancelled") return;
    const program = await loadProgramOf(trx, c.program_id);
    const now = new Date();
    await trx.updateTable("program_cohorts").set({ status: "cancelled", cancelled_at: now }).where("id", "=", cohortId).execute();
    const affected = await trx
      .updateTable("cohort_registrations as r")
      .set({ status: "cancelled", cancelled_at: now })
      .from("users as u")
      .whereRef("u.id", "=", "r.user_id")
      .where("r.cohort_id", "=", cohortId)
      .where("r.status", "in", ["pending", "approved", "waitlisted"])
      .returning(["r.id", "r.user_id", "u.email"])
      .execute();
    await trx.updateTable("enrollments").set({ status: "revoked" }).where("cohort_id", "=", cohortId).where("status", "=", "in_progress").execute();
    // Only people who had applied hear about it; a draft cohort never had applicants
    for (const a of affected) {
      await addEmailToOutbox(
        trx,
        { template: "cohort-cancelled", to: a.email, programTitle: program.title, cohortTitle: c.title },
        { userId: a.user_id, deduplicationKey: `cohort-cancelled:${a.id}` },
      );
    }
  });
  await audit(db, { action: "cohort.cancelled", userId: user.id, entityType: "cohort", entityId: cohortId, ip: meta.ip });
}

// ---------------------------------------------------------------- enrollments granted by a cohort

/**
 * Enroll an approved applicant in every course of the program. An existing direct enrollment is left as it is
 * (the learner keeps their progress and is not held back until the cohort starts); an enrollment revoked by an
 * earlier cohort is restored and moved to this cohort.
 */
async function enrollFromCohort(trx: Tx, userId: string, cohortId: string, programId: string) {
  const courses = await trx.selectFrom("program_courses").select("course_id").where("program_id", "=", programId).execute();
  for (const { course_id } of courses) {
    await trx
      .insertInto("enrollments")
      .values({ user_id: userId, course_id, cohort_id: cohortId })
      .onConflict((oc) =>
        oc.columns(["user_id", "course_id"]).doUpdateSet({
          status: sql`case when enrollments.status = 'revoked' and enrollments.cohort_id is not null then 'in_progress' else enrollments.status end`,
          cohort_id: sql`case when enrollments.status = 'revoked' and enrollments.cohort_id is not null then excluded.cohort_id else enrollments.cohort_id end`,
        }),
      )
      .execute();
  }
}

async function revokeCohortEnrollments(trx: Tx, userId: string, cohortId: string) {
  await trx.updateTable("enrollments").set({ status: "revoked" }).where("cohort_id", "=", cohortId).where("user_id", "=", userId).where("status", "=", "in_progress").execute();
}

async function notifyApproved(trx: Tx, reg: { id: string; userId: string; email: string }, cohort: { title: string; starts_at: Date }, program: { slug: string; title: string }) {
  await addEmailToOutbox(
    trx,
    { template: "cohort-application-approved", to: reg.email, programTitle: program.title, cohortTitle: cohort.title, startsAt: formatThaiDateTime(cohort.starts_at), programLink: programLink(program.slug) },
    { userId: reg.userId, deduplicationKey: `cohort-app:${reg.id}:approved:${Date.now()}` },
  );
}

/**
 * Move people from the waitlist into free seats, oldest application first. Caller holds the cohort lock.
 * Without approval they are approved and enrolled; with approval they join the review queue.
 * Skipped when the waitlist_promotion automation is paused — seats stay reserved for manual admin action.
 */
async function promoteWaitlist(trx: Tx, cohortId: string) {
  const flags = await getAutomationFlags();
  if (flags.paused.includes("waitlist_promotion")) return;
  const c = await loadCohort(trx, cohortId);
  if (c.status !== "published" || c.ends_at <= new Date()) return;
  const program = await loadProgramOf(trx, c.program_id);
  for (;;) {
    if (decideSeat({ capacity: c.capacity, taken: await seatsTaken(trx, cohortId), waitlistEnabled: false }) !== "seat") return;
    const next = await trx
      .selectFrom("cohort_registrations as r")
      .innerJoin("users as u", "u.id", "r.user_id")
      .select(["r.id", "r.user_id", "u.email"])
      .where("r.cohort_id", "=", cohortId)
      .where("r.status", "=", "waitlisted")
      .orderBy("r.applied_at")
      .limit(1)
      .executeTakeFirst();
    if (!next) return;
    if (c.requires_approval) {
      await trx.updateTable("cohort_registrations").set({ status: "pending", waitlist_offer_sent_at: new Date() }).where("id", "=", next.id).execute();
    } else {
      await trx.updateTable("cohort_registrations").set({ status: "approved", decided_at: new Date(), decided_by: null }).where("id", "=", next.id).execute();
      await enrollFromCohort(trx, next.user_id, cohortId, c.program_id);
      await notifyApproved(trx, { id: next.id, userId: next.user_id, email: next.email }, c, program);
    }
  }
}

// ---------------------------------------------------------------- applicant

export async function applyToCohort(user: CurrentUser, cohortId: string, rawAnswers: unknown): Promise<{ status: RegistrationStatus }> {
  const { db } = ctx();
  const profile = await applicantProfile(user);
  return db.transaction().execute(async (trx) => {
    const c = await loadCohort(trx, cohortId, true);
    const program = await loadProgramOf(trx, c.program_id);
    if (c.status !== "published" || (program.visibility !== "published" && program.visibility !== "unlisted")) throw new HttpError(404, "NOT_FOUND");
    if (deriveCohortPhase(cohortTimeline(c), new Date()) !== "open") throw new HttpError(409, "REGISTRATION_NOT_OPEN");

    const existing = await trx.selectFrom("cohort_registrations").select(["id", "status"]).where("cohort_id", "=", cohortId).where("user_id", "=", user.id).executeTakeFirst();
    if (existing && existing.status !== "cancelled") throw new HttpError(409, "ALREADY_APPLIED");

    // Anti-farming: an instructor can't earn a certificate from their own course
    const own = await trx
      .selectFrom("program_courses as pc")
      .innerJoin("courses as co", "co.id", "pc.course_id")
      .select("co.id")
      .where("pc.program_id", "=", c.program_id)
      .where("co.instructor_id", "=", user.id)
      .executeTakeFirst();
    if (own) throw new HttpError(403, "CANNOT_ENROLL_OWN_COURSE");
    await assertProfileComplete(user.id);

    const rules = parseEligibilityRules(c.eligibility);
    const reasons = evaluateEligibility(rules, profile);
    if (reasons.length) throw new HttpError(422, "NOT_ELIGIBLE", reasons.map((r) => r.message).join(" · "));
    const { answers, errors } = normalizeAnswers(rules.applicationForm, rawAnswers);
    if (errors.length) throw new HttpError(400, "APPLICATION_INVALID", errors.join(" · "));

    const seat = decideSeat({ capacity: c.capacity, taken: await seatsTaken(trx, cohortId), waitlistEnabled: c.waitlist_enabled });
    if (seat === "full") throw new HttpError(409, "COHORT_FULL");
    const now = new Date();
    const status: RegistrationStatus = seat === "waitlist" ? "waitlisted" : c.requires_approval ? "pending" : "approved";
    const values = {
      status,
      answers: JSON.stringify(answers) as unknown as JsonValue,
      applied_at: now,
      decided_at: status === "approved" ? now : null,
      decided_by: null,
      decision_note: null,
      cancelled_at: null,
    };
    const reg = existing
      ? await trx.updateTable("cohort_registrations").set(values).where("id", "=", existing.id).returning("id").executeTakeFirstOrThrow()
      : await trx.insertInto("cohort_registrations").values({ ...values, cohort_id: cohortId, user_id: user.id }).returning("id").executeTakeFirstOrThrow();

    if (status === "approved") {
      await enrollFromCohort(trx, user.id, cohortId, c.program_id);
      await notifyApproved(trx, { id: reg.id, userId: user.id, email: user.email }, c, program);
    } else {
      await addEmailToOutbox(
        trx,
        { template: "cohort-application-received", to: user.email, programTitle: program.title, cohortTitle: c.title, waitlisted: status === "waitlisted", programLink: programLink(program.slug) },
        { userId: user.id, deduplicationKey: `cohort-app:${reg.id}:received:${now.getTime()}` },
      );
    }
    return { status };
  });
}

/** The applicant withdraws before training starts; their seat goes to the waitlist */
export async function withdrawRegistration(user: CurrentUser, cohortId: string) {
  await ctx()
    .db.transaction()
    .execute(async (trx) => {
      const c = await loadCohort(trx, cohortId, true);
      const reg = await trx.selectFrom("cohort_registrations").select(["id", "status"]).where("cohort_id", "=", cohortId).where("user_id", "=", user.id).executeTakeFirst();
      if (!reg || !["pending", "approved", "waitlisted"].includes(reg.status)) throw new HttpError(404, "NOT_FOUND");
      if (c.starts_at <= new Date()) throw new HttpError(409, "COHORT_ALREADY_STARTED");
      await trx.updateTable("cohort_registrations").set({ status: "cancelled", cancelled_at: new Date() }).where("id", "=", reg.id).execute();
      if (reg.status === "approved") await revokeCohortEnrollments(trx, user.id, cohortId);
      await promoteWaitlist(trx, cohortId);
    });
}

export async function myRegistrations(userId: string) {
  const rows = await ctx()
    .db.selectFrom("cohort_registrations as r")
    .innerJoin("program_cohorts as c", "c.id", "r.cohort_id")
    .innerJoin("programs as p", "p.id", "c.program_id")
    .select([
      "r.id", "r.status", "r.applied_at", "r.decision_note",
      "c.id as cohort_id", "c.title as cohort_title", "c.status as cohort_status", "c.registration_opens_at", "c.registration_closes_at", "c.starts_at", "c.ends_at",
      "p.slug as program_slug", "p.title as program_title",
    ])
    .where("r.user_id", "=", userId)
    .where("r.status", "<>", "cancelled")
    .orderBy("c.starts_at", "desc")
    .limit(50)
    .execute();
  const now = new Date();
  return rows.map((r) => ({ ...r, phase: deriveCohortPhase(cohortTimeline({ ...r, status: r.cohort_status }), now) }));
}

// ---------------------------------------------------------------- admin: review

export async function watchCohort(user: CurrentUser, cohortId: string) {
  const { db } = ctx();
  const c = await loadCohort(db, cohortId);
  if (deriveCohortPhase(cohortTimeline(c), new Date()) !== "scheduled") throw new HttpError(409, "COHORT_NOT_SCHEDULED");
  await db.insertInto("cohort_watches").values({ user_id: user.id, cohort_id: cohortId }).onConflict((oc) => oc.columns(["user_id", "cohort_id"]).doNothing()).execute();
}

export async function unwatchCohort(user: CurrentUser, cohortId: string) {
  await ctx().db.deleteFrom("cohort_watches").where("user_id", "=", user.id).where("cohort_id", "=", cohortId).execute();
}

export async function isWatching(userId: string, cohortId: string): Promise<boolean> {
  const row = await ctx().db.selectFrom("cohort_watches").select("id").where("user_id", "=", userId).where("cohort_id", "=", cohortId).executeTakeFirst();
  return Boolean(row);
}

export async function getCohortForAdmin(user: CurrentUser, cohortId: string) {
  assertAdmin(user);
  const { db } = ctx();
  const cohort = await loadCohort(db, cohortId);
  const [program, registrations, taken] = await Promise.all([
    loadProgramOf(db, cohort.program_id),
    db
      .selectFrom("cohort_registrations as r")
      .innerJoin("users as u", "u.id", "r.user_id")
      .leftJoin("user_profiles as up", "up.user_id", "r.user_id")
      .select([
        "r.id", "r.status", "r.applied_at", "r.decided_at", "r.decision_note", "r.answers", "u.email", "up.phone", "up.province",
        sql<string | null>`coalesce(u.legal_full_name_th, u.legal_full_name_en)`.as("name"),
      ])
      .where("r.cohort_id", "=", cohortId)
      .orderBy("r.applied_at")
      .limit(5000)
      .execute(),
    seatsTaken(db, cohortId),
  ]);

  // Completion report: how many approved registrants finished every required course.
  const required = await db
    .selectFrom("program_courses")
    .select(sql<number>`count(*)::int`.as("n"))
    .where("program_id", "=", program.id)
    .where("is_required", "=", true)
    .executeTakeFirstOrThrow();
  const completed = await db
    .selectFrom("cohort_registrations as r")
    .select(sql<number>`count(*)::int`.as("n"))
    .where("r.cohort_id", "=", cohortId)
    .where("r.status", "=", "approved")
    .where(sql<boolean>`(select count(*) from enrollments e join program_courses pc on pc.course_id = e.course_id where pc.program_id = ${program.id} and pc.is_required = true and e.user_id = r.user_id and e.cohort_id = r.cohort_id and e.status = 'completed') >= ${required.n}`)
    .executeTakeFirstOrThrow();

  return {
    cohort: { ...cohort, phase: deriveCohortPhase(cohortTimeline(cohort), new Date()), rules: parseEligibilityRules(cohort.eligibility) },
    program,
    registrations: registrations.map((r) => ({ ...r, answers: (r.answers ?? {}) as Record<string, string> })),
    taken,
    completion: { required: required.n, completed: completed.n },
  };
}

/** Approve or reject several applicants at once. Admin approval may exceed capacity on purpose (an override). */
export async function decideRegistrations(
  user: CurrentUser,
  cohortId: string,
  input: { ids: string[]; decision: "approve" | "reject"; note?: string | undefined },
  meta: { ip: string },
  expectedStatus?: string,
) {
  if (expectedStatus === undefined) assertAdmin(user);
  const { db } = ctx();
  const changed = await db.transaction().execute(async (trx) => {
    const c = await loadCohort(trx, cohortId, true);
    if (expectedStatus !== undefined) {
      if (input.ids.length !== 1) throw new HttpError(400,"VALIDATION_FAILED");
      await authorizeRecord(trx,user,"registrations",input.ids[0]!);
    }
    if (c.status === "cancelled") throw new HttpError(409, "COHORT_CANCELLED");
    const program = await loadProgramOf(trx, c.program_id);
    const from: RegistrationStatus[] = input.decision === "approve" ? ["pending", "waitlisted"] : ["pending", "waitlisted", "approved"];
    const regs = await trx
      .selectFrom("cohort_registrations as r")
      .innerJoin("users as u", "u.id", "r.user_id")
      .select(["r.id", "r.user_id", "r.status", "u.email"])
      .where("r.cohort_id", "=", cohortId)
      .where("r.id", "in", input.ids)
      .where("r.status", "in", from)
      .execute();
    if (expectedStatus !== undefined) {
      const record = regs[0];
      if (!record || record.status !== expectedStatus) throw new HttpError(409,"STALE_RECORD","สถานะเปลี่ยนแล้ว กรุณาตรวจสอบรายการล่าสุด");
      if (input.decision === "approve" && record.status === "waitlisted" && c.capacity !== null && await seatsTaken(trx,cohortId) >= c.capacity) throw new HttpError(409,"COHORT_FULL");
    }
    const now = new Date();
    const note = input.note?.trim() || null;
    for (const r of regs) {
      await trx
        .updateTable("cohort_registrations")
        .set({ status: input.decision === "approve" ? "approved" : "rejected", decided_at: now, decided_by: user.id, decision_note: note })
        .where("id", "=", r.id)
        .execute();
      if (input.decision === "approve") {
        await enrollFromCohort(trx, r.user_id, cohortId, c.program_id);
        await notifyApproved(trx, { id: r.id, userId: r.user_id, email: r.email }, c, program);
      } else {
        if (r.status === "approved") await revokeCohortEnrollments(trx, r.user_id, cohortId);
        await addEmailToOutbox(
          trx,
          { template: "cohort-application-rejected", to: r.email, programTitle: program.title, cohortTitle: c.title, ...(note ? { note } : {}) },
          { userId: r.user_id, deduplicationKey: `cohort-app:${r.id}:rejected:${now.getTime()}` },
        );
      }
    }
    if (input.decision === "reject") await promoteWaitlist(trx, cohortId);
    return regs.length;
  });
  await audit(db, { action: "cohort.registration_decided", userId: user.id, entityType: "cohort", entityId: cohortId, ip: meta.ip, details: { decision: input.decision, count: changed } });
  return { changed };
}

const STATUS_TH: Record<string, string> = { pending: "รอพิจารณา", approved: "อนุมัติ", rejected: "ไม่อนุมัติ", waitlisted: "รายชื่อสำรอง", cancelled: "ยกเลิก" };

/** Neutralize spreadsheet formulas (CSV injection) and quote every cell */
function csvCell(v: string | null | undefined): string {
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const EXPORT_COLS = {
  email: "อีเมล",
  name: "ชื่อ-นามสกุล",
  phone: "เบอร์โทรศัพท์",
  province: "จังหวัด",
  status: "สถานะ",
  applied_at: "วันที่สมัคร",
  decided_at: "วันที่พิจารณา",
  decision_note: "หมายเหตุ",
} as const;

export const EXPORT_COL_KEYS = Object.keys(EXPORT_COLS) as (keyof typeof EXPORT_COLS)[];

export async function exportRegistrationsCsv(
  user: CurrentUser,
  cohortId: string,
  meta: { ip: string; cols?: string[] },
): Promise<{ filename: string; csv: string }> {
  const { cohort, registrations } = await getCohortForAdmin(user, cohortId);
  const form = cohort.rules.applicationForm;

  const allowedCols = new Set(meta.cols ?? EXPORT_COL_KEYS);
  const formKeys = meta.cols
    ? meta.cols.filter((c) => c.startsWith("form_")).map((c) => c.slice(5))
    : form.map((f) => f.key);

  const activeCols = EXPORT_COL_KEYS.filter((k) => allowedCols.has(k));
  const activeFormFields = form.filter((f) => formKeys.includes(f.key));

  const header = [...activeCols.map((k) => EXPORT_COLS[k]), ...activeFormFields.map((f) => f.label)];

  const rows = registrations.map((r) => [
    ...activeCols.map((k) => {
      if (k === "email") return r.email;
      if (k === "name") return r.name;
      if (k === "phone") return r.phone;
      if (k === "province") return r.province;
      if (k === "status") return STATUS_TH[r.status] ?? r.status;
      if (k === "applied_at") return formatThaiDateTime(r.applied_at);
      if (k === "decided_at") return r.decided_at ? formatThaiDateTime(r.decided_at) : "";
      if (k === "decision_note") return r.decision_note;
      return "";
    }),
    ...activeFormFields.map((f) => r.answers[f.key] ?? ""),
  ]);

  await audit(ctx().db, { action: "cohort.registrations_exported", userId: user.id, entityType: "cohort", entityId: cohortId, ip: meta.ip, details: { rows: rows.length, cols: header.length } });
  const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  return { filename: `registrations-${cohortId.slice(0, 8)}.csv`, csv };
}

/** Worker: expire pending seats offered from the waitlist that passed their acceptance deadline */
export async function expireWaitlistOffers() {
  const { db } = ctx();
  const expired = await db
    .selectFrom("cohort_registrations as r")
    .innerJoin("program_cohorts as c", "c.id", "r.cohort_id")
    .select(["r.id", "r.cohort_id"])
    .where("r.status", "=", "pending")
    .where("r.waitlist_offer_sent_at", "is not", null)
    .whereRef(
      sql<Date>`r.waitlist_offer_sent_at + (c.waitlist_acceptance_hours * interval '1 hour')`,
      "<",
      sql<Date>`now()`,
    )
    .execute();
  for (const row of expired) {
    await db.transaction().execute(async (trx) => {
      const updated = await trx.updateTable("cohort_registrations")
        .set({ status: "waitlisted", waitlist_offer_sent_at: null })
        .where("id", "=", row.id)
        .where("status", "=", "pending")
        .executeTakeFirst();
      if (Number(updated.numUpdatedRows) > 0) await promoteWaitlist(trx, row.cohort_id);
    });
  }
  return { expired: expired.length };
}

/** Admin: manually promote the next waitlisted applicant for a cohort */
export async function promoteNextWaitlisted(user: CurrentUser, cohortId: string) {
  const { db } = ctx();
  await db.transaction().execute(async (trx) => {
    await loadCohort(trx, cohortId, true);
    await promoteWaitlist(trx, cohortId);
  });
  return { ok: true };
}
