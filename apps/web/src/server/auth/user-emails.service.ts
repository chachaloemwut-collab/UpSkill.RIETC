import "server-only";
import { ctx } from "../context";
import { HttpError } from "../http";
import { audit } from "../audit";
import { addVerificationEmail } from "./auth.service";

export async function listUserEmails(userId: string) {
  const { db } = ctx();
  return await db
    .selectFrom("user_emails")
    .select(["id", "email", "is_primary", "verified_at", "created_at"])
    .where("user_id", "=", userId)
    .orderBy("is_primary", "desc")
    .orderBy("created_at", "asc")
    .execute();
}

export async function addUserEmail(userId: string, emailRaw: string, ip: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!email.includes("@") || email.length > 254) {
    throw new HttpError(400, "INVALID_EMAIL", "รูปแบบอีเมลไม่ถูกต้อง");
  }
  const { db } = ctx();

  // Check uniqueness across user_emails
  const existing = await db
    .selectFrom("user_emails")
    .select(["id", "user_id"])
    .where("email", "=", email)
    .executeTakeFirst();
  if (existing) {
    throw new HttpError(409, "EMAIL_ALREADY_EXISTS", "อีเมลนี้ถูกใช้งานในระบบแล้ว");
  }

  const row = await db
    .insertInto("user_emails")
    .values({
      user_id: userId,
      email,
      is_primary: false,
      verified_at: null,
    })
    .returning(["id", "email", "created_at"])
    .executeTakeFirstOrThrow();

  await addVerificationEmail(db, userId, email);
  await audit(db, {
    action: "user.email_added",
    userId,
    entityType: "user",
    entityId: userId,
    ip,
    details: { email },
  });

  return row;
}

export async function setPrimaryEmail(userId: string, emailId: string, ip: string) {
  const { db } = ctx();
  const target = await db
    .selectFrom("user_emails")
    .selectAll()
    .where("id", "=", emailId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!target) {
    throw new HttpError(404, "EMAIL_NOT_FOUND", "ไม่พบอีเมลนี้ในบัญชีของคุณ");
  }

  if (target.is_primary) {
    return; // Already primary
  }

  if (!target.verified_at) {
    throw new HttpError(400, "EMAIL_NOT_VERIFIED", "ต้องยืนยันอีเมลนี้ก่อน จึงจะสามารถตั้งเป็นอีเมลหลักได้");
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("user_emails")
      .set({ is_primary: false })
      .where("user_id", "=", userId)
      .execute();

    await trx
      .updateTable("user_emails")
      .set({ is_primary: true })
      .where("id", "=", emailId)
      .execute();

    await trx
      .updateTable("users")
      .set({
        email: target.email,
        email_verified_at: target.verified_at,
      })
      .where("id", "=", userId)
      .execute();
  });

  await audit(db, {
    action: "user.email_primary_changed",
    userId,
    entityType: "user",
    entityId: userId,
    ip,
    details: { newPrimary: target.email },
  });
}

export async function removeUserEmail(userId: string, emailId: string, ip: string) {
  const { db } = ctx();
  const emails = await db
    .selectFrom("user_emails")
    .selectAll()
    .where("user_id", "=", userId)
    .execute();

  const target = emails.find((e) => e.id === emailId);
  if (!target) {
    throw new HttpError(404, "EMAIL_NOT_FOUND", "ไม่พบอีเมลนี้ในบัญชีของคุณ");
  }

  // Hard Invariant: At least one email must exist in the system for this account
  if (emails.length <= 1) {
    throw new HttpError(400, "CANNOT_DELETE_LAST_EMAIL", "ไม่สามารถลบได้ บัญชีต้องมีอีเมลในระบบอย่างน้อยหนึ่งอีเมลเสมอ");
  }

  if (target.is_primary) {
    throw new HttpError(400, "CANNOT_DELETE_PRIMARY_EMAIL", "ไม่สามารถลบอีเมลหลักได้ กรุณากำหนดอีเมลอื่นเป็นอีเมลหลักก่อนดำเนินการ");
  }

  await db
    .deleteFrom("user_emails")
    .where("id", "=", emailId)
    .where("user_id", "=", userId)
    .execute();

  await audit(db, {
    action: "user.email_removed",
    userId,
    entityType: "user",
    entityId: userId,
    ip,
    details: { removedEmail: target.email },
  });
}

export async function resendVerificationForSecondaryEmail(userId: string, emailId: string) {
  const { db } = ctx();
  const target = await db
    .selectFrom("user_emails")
    .selectAll()
    .where("id", "=", emailId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!target) {
    throw new HttpError(404, "EMAIL_NOT_FOUND", "ไม่พบอีเมลนี้ในบัญชีของคุณ");
  }

  if (target.verified_at) {
    throw new HttpError(400, "EMAIL_ALREADY_VERIFIED", "อีเมลนี้ได้รับการยืนยันแล้ว");
  }

  await addVerificationEmail(db, userId, target.email);
}
