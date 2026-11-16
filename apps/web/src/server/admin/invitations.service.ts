import "server-only";
import { generateToken, hashToken } from "@upskill/core";
import { audit } from "../audit";
import { ctx } from "../context";
import { addEmailToOutbox } from "../email/outbox.service";
import { HttpError } from "../http";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface InvitationRow {
  id: string;
  email: string;
  inviterName: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedUserId: string | null;
  message: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  link: string | null;
}

function inviterNameOf(user: { legal_full_name_th: string | null; legal_full_name_en: string | null; username: string | null; email: string }): string {
  return user.legal_full_name_th ?? user.legal_full_name_en ?? user.username ?? user.email;
}

function effectiveStatus(row: { status: string; expires_at: Date }): InvitationRow["status"] {
  if (row.status === "pending" && row.expires_at < new Date()) return "expired";
  return row.status as InvitationRow["status"];
}

/** Only admins can invite someone to teach — there is no self-promotion path. */
export async function createInstructorInvitation(adminId: string, input: { email: string; message?: string }, meta: { ip: string }) {
  const { db, env } = ctx();
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "INVALID_EMAIL");

  const existing = await db.selectFrom("users").select(["id", "role", "status", "deleted_at"]).where("email", "=", email).executeTakeFirst();
  if (existing?.role === "instructor") throw new HttpError(409, "ALREADY_INSTRUCTOR");
  if (existing && (existing.status !== "active" || existing.deleted_at !== null)) throw new HttpError(409, "USER_NOT_ACTIVE");

  const pending = await db
    .selectFrom("instructor_invitations")
    .select("id")
    .where("email", "=", email)
    .where("status", "=", "pending")
    .where("expires_at", ">", new Date())
    .executeTakeFirst();
  if (pending) throw new HttpError(409, "INVITE_ALREADY_PENDING");

  const inviter = await db.selectFrom("users").select(["legal_full_name_th", "legal_full_name_en", "username", "email"]).where("id", "=", adminId).executeTakeFirstOrThrow();

  const token = generateToken();
  const invitation = await db
    .insertInto("instructor_invitations")
    .values({
      email,
      invited_by: adminId,
      token_hash: hashToken(token).toString("hex"),
      token,
      invited_user_id: existing?.id ?? null,
      message: input.message?.trim() || null,
      expires_at: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning(["id", "expires_at"])
    .executeTakeFirstOrThrow();

  const link = `${env.APP_ORIGIN}/invitations/${token}`;
  await addEmailToOutbox(
    db,
    { template: "instructor-invitation", to: email, link, inviterName: inviterNameOf(inviter), message: input.message?.trim() || undefined },
    { deduplicationKey: `instructor-invite:${invitation.id}` },
  );
  await audit(db, { action: "admin.instructor_invited", userId: adminId, entityType: "instructor_invitation", entityId: invitation.id, ip: meta.ip, details: { email } });

  return { id: invitation.id, email, link, expiresAt: invitation.expires_at };
}

export async function listInstructorInvitations(): Promise<InvitationRow[]> {
  const { db, env } = ctx();
  const rows = await db
    .selectFrom("instructor_invitations as i")
    .innerJoin("users as u", "u.id", "i.invited_by")
    .select([
      "i.id", "i.email", "i.status", "i.invited_user_id", "i.message", "i.expires_at", "i.accepted_at", "i.created_at", "i.token",
      "u.legal_full_name_th", "u.legal_full_name_en", "u.username", "u.email as inviter_email",
    ])
    .orderBy("i.created_at", "desc")
    .limit(100)
    .execute();
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    inviterName: inviterNameOf(r),
    status: effectiveStatus(r),
    invitedUserId: r.invited_user_id,
    message: r.message,
    expiresAt: r.expires_at,
    acceptedAt: r.accepted_at,
    createdAt: r.created_at,
    // Admins may copy the link for channels other than email (e.g. Line) while SMTP is not configured
    link: r.status === "pending" && r.expires_at >= new Date() ? `${env.APP_ORIGIN}/invitations/${r.token}` : null,
  }));
}

/** Pending invitation link for the current user (shown as a banner on /me). */
export async function getMyPendingInvitation(email: string): Promise<{ link: string; inviterName: string; expiresAt: Date } | null> {
  const { db, env } = ctx();
  const row = await db
    .selectFrom("instructor_invitations as i")
    .innerJoin("users as u", "u.id", "i.invited_by")
    .select(["i.token", "i.expires_at", "u.legal_full_name_th", "u.legal_full_name_en", "u.username", "u.email"])
    .where("i.email", "=", email.toLowerCase())
    .where("i.status", "=", "pending")
    .where("i.expires_at", ">", new Date())
    .orderBy("i.created_at", "desc")
    .limit(1)
    .executeTakeFirst();
  if (!row) return null;
  return { link: `${env.APP_ORIGIN}/invitations/${row.token}`, inviterName: inviterNameOf(row), expiresAt: row.expires_at };
}

export async function revokeInstructorInvitation(adminId: string, invitationId: string, meta: { ip: string }) {
  const { db } = ctx();
  const row = await db.selectFrom("instructor_invitations").select(["id", "status", "email"]).where("id", "=", invitationId).executeTakeFirst();
  if (!row) throw new HttpError(404, "NOT_FOUND");
  if (row.status !== "pending") throw new HttpError(409, "NOT_REVOCABLE");
  await db.updateTable("instructor_invitations").set({ status: "revoked", revoked_at: new Date(), revoked_by: adminId, updated_at: new Date() }).where("id", "=", invitationId).execute();
  await audit(db, { action: "admin.instructor_invitation_revoked", userId: adminId, entityType: "instructor_invitation", entityId: invitationId, ip: meta.ip, details: { email: row.email } });
}

/** Public view for the accept page (no auth): who invited, what the invitation says. */
export async function getInvitationView(token: string) {
  const row = await ctx()
    .db.selectFrom("instructor_invitations as i")
    .innerJoin("users as u", "u.id", "i.invited_by")
    .select([
      "i.id", "i.email", "i.status", "i.message", "i.expires_at", "i.accepted_at",
      "u.legal_full_name_th", "u.legal_full_name_en", "u.username", "u.email as inviter_email",
    ])
    .where("i.token_hash", "=", hashToken(token).toString("hex"))
    .executeTakeFirst();
  if (!row) return null;
  return {
    email: row.email,
    inviterName: inviterNameOf(row),
    message: row.message,
    status: effectiveStatus(row),
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
  };
}

/** Accept the invitation as the logged-in user. The account email must match the invitation. */
export async function acceptInstructorInvitation(userId: string, token: string, meta: { ip: string }) {
  const { db } = ctx();
  const row = await db
    .selectFrom("instructor_invitations")
    .select(["id", "email", "status", "invited_user_id", "expires_at"])
    .where("token_hash", "=", hashToken(token).toString("hex"))
    .executeTakeFirst();
  if (!row) throw new HttpError(404, "INVITATION_NOT_FOUND");
  if (row.status === "accepted") throw new HttpError(409, "ALREADY_ACCEPTED");
  if (row.status === "revoked") throw new HttpError(403, "INVITATION_REVOKED");
  if (row.status === "pending" && row.expires_at < new Date()) throw new HttpError(410, "INVITATION_EXPIRED");

  const user = await db.selectFrom("users").select(["id", "email", "role", "status"]).where("id", "=", userId).executeTakeFirstOrThrow();
  if (user.status !== "active") throw new HttpError(403, "ACCOUNT_DISABLED");
  if ((row.invited_user_id !== null && row.invited_user_id !== user.id) || user.email.toLowerCase() !== row.email.toLowerCase()) {
    throw new HttpError(403, "EMAIL_MISMATCH");
  }

  await db.transaction().execute(async (trx) => {
    await trx.updateTable("users").set({ role: "instructor", updated_at: new Date() }).where("id", "=", user.id).where("role", "=", "member").execute();
    await trx.updateTable("instructor_invitations").set({ status: "accepted", accepted_at: new Date(), updated_at: new Date() }).where("id", "=", row.id).execute();
  });
  await audit(db, { action: "user.instructor_accepted", userId, entityType: "instructor_invitation", entityId: row.id, ip: meta.ip, details: { email: row.email } });
  return { role: "instructor" as const };
}
