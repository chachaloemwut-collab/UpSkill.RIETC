import "server-only";
import { sql } from "@upskill/db";
import { ctx } from "../context";
import { addEmailToOutbox } from "../email/outbox.service";
import { HttpError } from "../http";
import type { CurrentUser } from "../auth/session";
import { audit } from "../audit";

async function managerName(userId: string) {
  return ctx()
    .db.selectFrom("users")
    .select(sql<string>`coalesce(legal_full_name_th, legal_full_name_en, split_part(email, '@', 1))`.as("name"))
    .where("id", "=", userId)
    .executeTakeFirstOrThrow();
}

async function managedCourse(user: CurrentUser, courseId: string) {
  let query = ctx().db.selectFrom("courses").select(["id", "title", "slug", "visibility", "instructor_id"]).where("id", "=", courseId);
  if (user.role !== "admin") query = query.where("instructor_id", "=", user.id);
  const course = await query.executeTakeFirst();
  if (!course) throw new HttpError(404, "NOT_FOUND");
  if (course.visibility !== "published" && course.visibility !== "unlisted") throw new HttpError(409, "COURSE_NOT_ASSIGNABLE");
  return course;
}

export async function assignmentOverview(user: CurrentUser) {
  const { db } = ctx();
  let groupsQuery = db
    .selectFrom("learning_groups as g")
    .select(["g.id", "g.name", "g.description", "g.created_at", sql<number>`(select count(*)::int from learning_group_members gm where gm.group_id = g.id)`.as("member_count")])
    .orderBy("g.updated_at", "desc");
  if (user.role !== "admin") groupsQuery = groupsQuery.where("g.created_by", "=", user.id);
  let assignmentsQuery = db
    .selectFrom("course_assignments as a")
    .innerJoin("courses as c", "c.id", "a.course_id")
    .leftJoin("users as tu", "tu.id", "a.target_user_id")
    .leftJoin("learning_groups as g", "g.id", "a.target_group_id")
    .select([
      "a.id", "a.status", "a.due_at", "a.note", "a.created_at", "c.title as course_title",
      sql<string>`coalesce(tu.email::text, g.name)`.as("target_name"),
      sql<number>`(select count(*)::int from course_assignment_recipients r where r.assignment_id = a.id)`.as("recipient_count"),
      sql<number>`(select count(*)::int from course_assignment_recipients r join enrollments e on e.id = r.enrollment_id where r.assignment_id = a.id and e.status = 'completed')`.as("completed_count"),
    ])
    .orderBy("a.created_at", "desc")
    .limit(100);
  if (user.role !== "admin") assignmentsQuery = assignmentsQuery.where("a.assigned_by", "=", user.id);
  const [groups, assignments, courses] = await Promise.all([
    groupsQuery.execute(),
    assignmentsQuery.execute(),
    user.role === "admin"
      ? db.selectFrom("courses").select(["id", "title"]).where("visibility", "in", ["published", "unlisted"]).orderBy("title").execute()
      : db.selectFrom("courses").select(["id", "title"]).where("instructor_id", "=", user.id).where("visibility", "in", ["published", "unlisted"]).orderBy("title").execute(),
  ]);
  return { groups, assignments, courses };
}

export async function createLearningGroup(user: CurrentUser, input: { name: string; description?: string }) {
  const group = await ctx()
    .db.insertInto("learning_groups")
    .values({ name: input.name.trim(), description: input.description?.trim() || null, created_by: user.id })
    .returning("id")
    .executeTakeFirstOrThrow();
  return group;
}

async function ownedGroup(user: CurrentUser, groupId: string) {
  let query = ctx().db.selectFrom("learning_groups").select(["id", "name"]).where("id", "=", groupId);
  if (user.role !== "admin") query = query.where("created_by", "=", user.id);
  const group = await query.executeTakeFirst();
  if (!group) throw new HttpError(404, "NOT_FOUND");
  return group;
}

export async function updateGroupMember(user: CurrentUser, groupId: string, email: string, operation: "add" | "remove") {
  await ownedGroup(user, groupId);
  const member = await ctx().db.selectFrom("users").select("id").where("email", "=", email.trim().toLowerCase()).where("status", "=", "active").executeTakeFirst();
  if (!member) throw new HttpError(404, "USER_NOT_FOUND");
  if (operation === "add") {
    await ctx().db.insertInto("learning_group_members").values({ group_id: groupId, user_id: member.id }).onConflict((oc) => oc.columns(["group_id", "user_id"]).doNothing()).execute();
  } else {
    await ctx().db.deleteFrom("learning_group_members").where("group_id", "=", groupId).where("user_id", "=", member.id).execute();
  }
}

export type BulkImportRow = { email: string; status: "added" | "already_member" | "not_found" | "duplicate" };

/**
 * Bulk-import members into a learning group from a list of emails.
 * With preview = true, returns what would happen without changing anything.
 * With preview = false, adds all resolved members (idempotent: skips existing).
 */
export async function bulkImportGroupMembers(
  user: CurrentUser,
  groupId: string,
  rawEmails: string[],
  options: { preview: boolean },
): Promise<{ rows: BulkImportRow[]; added: number }> {
  const { db } = ctx();
  await ownedGroup(user, groupId);

  // Normalize and deduplicate, tracking which inputs were duplicates
  const seen = new Set<string>();
  const rows: BulkImportRow[] = [];
  const unique: string[] = [];
  for (const raw of rawEmails) {
    const e = raw.trim().toLowerCase();
    if (!e) continue;
    if (seen.has(e)) { rows.push({ email: e, status: "duplicate" }); continue; }
    seen.add(e);
    unique.push(e);
  }
  if (unique.length === 0) return { rows, added: 0 };

  // Batch-fetch existing users and current group membership
  const [users, existing] = await Promise.all([
    db.selectFrom("users").select(["id", "email"]).where("email", "in", unique).where("status", "=", "active").execute(),
    db.selectFrom("learning_group_members as gm").innerJoin("users as u", "u.id", "gm.user_id").select("u.email").where("gm.group_id", "=", groupId).execute(),
  ]);
  const userMap = new Map(users.map((u) => [u.email, u.id]));
  const memberSet = new Set(existing.map((e) => e.email));

  for (const email of unique) {
    if (!userMap.has(email)) { rows.push({ email, status: "not_found" }); continue; }
    if (memberSet.has(email)) { rows.push({ email, status: "already_member" }); continue; }
    rows.push({ email, status: "added" });
  }

  if (!options.preview) {
    const toAdd = rows.filter((r) => r.status === "added").map((r) => ({ group_id: groupId, user_id: userMap.get(r.email)! }));
    if (toAdd.length > 0) {
      await db.insertInto("learning_group_members").values(toAdd).onConflict((oc) => oc.columns(["group_id", "user_id"]).doNothing()).execute();
    }
  }

  return { rows, added: rows.filter((r) => r.status === "added").length };
}

export async function assignCourse(
  user: CurrentUser,
  input: { courseId: string; targetType: "user" | "group"; target: string; dueAt?: Date; note?: string },
  ip: string,
) {
  const { db, env } = ctx();
  const course = await managedCourse(user, input.courseId);
  const by = await managerName(user.id);
  const targetUser = input.targetType === "user"
    ? await db.selectFrom("users").select(["id", "email"]).where("email", "=", input.target.trim().toLowerCase()).where("status", "=", "active").executeTakeFirst()
    : null;
  if (input.targetType === "user" && !targetUser) throw new HttpError(404, "USER_NOT_FOUND");
  const group = input.targetType === "group" ? await ownedGroup(user, input.target) : null;
  const recipients = targetUser
    ? [targetUser]
    : await db
        .selectFrom("learning_group_members as gm")
        .innerJoin("users as u", "u.id", "gm.user_id")
        .select(["u.id", "u.email"])
        .where("gm.group_id", "=", group!.id)
        .where("u.status", "=", "active")
        .execute();
  if (recipients.length === 0) throw new HttpError(409, "NO_RECIPIENTS");
  if (recipients.some((recipient) => recipient.id === course.instructor_id)) throw new HttpError(409, "COURSE_OWNER_IN_RECIPIENTS");

  const assignment = await db.transaction().execute(async (trx) => {
    const created = await trx
      .insertInto("course_assignments")
      .values({
        course_id: course.id,
        assigned_by: user.id,
        target_user_id: targetUser?.id ?? null,
        target_group_id: group?.id ?? null,
        due_at: input.dueAt ?? null,
        note: input.note?.trim() || null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    for (const recipient of recipients) {
      let enrollment = await trx
        .insertInto("enrollments")
        .values({ user_id: recipient.id, course_id: course.id })
        .onConflict((oc) => oc.columns(["user_id", "course_id"]).doNothing())
        .returning(["id", "status"])
        .executeTakeFirst();
      enrollment ??= await trx.selectFrom("enrollments").select(["id", "status"]).where("user_id", "=", recipient.id).where("course_id", "=", course.id).executeTakeFirstOrThrow();
      if (enrollment.status === "revoked") throw new HttpError(409, "RECIPIENT_ENROLLMENT_REVOKED");
      await trx.insertInto("course_assignment_recipients").values({ assignment_id: created.id, user_id: recipient.id, enrollment_id: enrollment.id }).execute();
      await addEmailToOutbox(
        trx,
        {
          template: "course-assigned",
          to: recipient.email,
          courseTitle: course.title,
          courseLink: `${env.APP_ORIGIN}/courses/${course.slug}`,
          assignedBy: by.name,
          ...(input.dueAt ? { dueAt: input.dueAt.toISOString() } : {}),
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        },
        { userId: recipient.id, deduplicationKey: `course-assigned:${created.id}:${recipient.id}` },
      );
    }
    return created;
  });
  await audit(db, { action: "course.assigned", userId: user.id, entityType: "course", entityId: course.id, ip, details: { assignmentId: assignment.id, recipientCount: recipients.length } });
  return assignment;
}

export async function cancelAssignment(user: CurrentUser, assignmentId: string, ip: string) {
  const { db } = ctx();
  let query = db
    .selectFrom("course_assignments as a")
    .innerJoin("courses as c", "c.id", "a.course_id")
    .select(["a.id", "a.course_id", "a.status", "c.title"])
    .where("a.id", "=", assignmentId);
  if (user.role !== "admin") query = query.where("a.assigned_by", "=", user.id);
  const assignment = await query.executeTakeFirst();
  if (!assignment) throw new HttpError(404, "NOT_FOUND");
  if (assignment.status === "cancelled") return;
  await db.transaction().execute(async (trx) => {
    const recipients = await trx
      .selectFrom("course_assignment_recipients as r")
      .innerJoin("users as u", "u.id", "r.user_id")
      .select(["r.user_id", "u.email"])
      .where("r.assignment_id", "=", assignment.id)
      .where("r.cancelled_at", "is", null)
      .execute();
    const now = new Date();
    await trx.updateTable("course_assignments").set({ status: "cancelled", cancelled_at: now }).where("id", "=", assignment.id).execute();
    await trx.updateTable("course_assignment_recipients").set({ cancelled_at: now }).where("assignment_id", "=", assignment.id).where("cancelled_at", "is", null).execute();
    for (const recipient of recipients) {
      await addEmailToOutbox(
        trx,
        { template: "assignment-cancelled", to: recipient.email, courseTitle: assignment.title },
        { userId: recipient.user_id, deduplicationKey: `assignment-cancelled:${assignment.id}:${recipient.user_id}` },
      );
    }
  });
  await audit(db, { action: "course.assignment_cancelled", userId: user.id, entityType: "course", entityId: assignment.course_id, ip, details: { assignmentId } });
}

export async function updateAssignmentDue(user: CurrentUser, assignmentId: string, dueAt: Date | null) {
  const { db } = ctx();
  let query = db.selectFrom("course_assignments").select(["id", "status"]).where("id", "=", assignmentId);
  if (user.role !== "admin") query = query.where("assigned_by", "=", user.id);
  const assignment = await query.executeTakeFirst();
  if (!assignment) throw new HttpError(404, "NOT_FOUND");
  if (assignment.status === "cancelled") throw new HttpError(409, "ASSIGNMENT_CANCELLED");
  await db.updateTable("course_assignments").set({ due_at: dueAt }).where("id", "=", assignmentId).execute();
  return { ok: true };
}
