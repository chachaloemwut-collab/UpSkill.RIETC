import "server-only";
import type { Database } from "@upskill/db";

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.google_linked"
  | "auth.unverified_account_taken_over"
  | "auth.password_reset"
  | "auth.account_deleted"
  | "user.admin_updated"
  | "user.sessions_revoked"
  | "user.email_added"
  | "user.email_primary_changed"
  | "user.email_removed"
  | "admin.instructor_invited"
  | "admin.instructor_invitation_revoked"
  | "user.instructor_accepted"
  | "admin.users_exported"
  | "user.legal_name_locked"
  | "user.legal_name_unlocked"
  | "user.pdpa_consent"
  | "course.updated"
  | "course.restored"
  | "course.published"
  | "course.archived"
  | "course.application_submitted"
  | "course.application_reviewed"
  | "course.applications_exported"
  | "course.suspended"
  | "course.completion_overridden"
  | "course.quiz_attempts_reset"
  | "quiz.corrections_applied"
  | "course.assigned"
  | "course.assignment_cancelled"
  | "course.instructor_changed"
  | "course.created_for_instructor"
  | "program.created"
  | "program.published"
  | "program.visibility_changed"
  | "program.deleted"
  | "cohort.created"
  | "cohort.published"
  | "cohort.cancelled"
  | "cohort.registration_decided"
  | "cohort.registrations_exported"
  | "announcement.published"
  | "announcement.broadcast"
  | "certificate.issued"
  | "certificate.test_issued"
  | "certificate.revoked"
  | "learning.session_superseded"
  | "learning.cheat_flag"
  | "system.email_settings_updated"
  | "system.email_settings_tested"
  | "system.google_oauth_settings_updated"
  | "programs.category_renamed"
  | "programs.category_deleted"
  | "system.course_defaults_updated"
  | "system.automation_toggled";

/** The app role can INSERT only (UPDATE/DELETE are blocked by both grant and trigger) */
export async function audit(
  db: Database,
  e: {
    action: AuditAction;
    userId?: string | null;
    entityType?: string;
    entityId?: string;
    ip?: string;
    userAgent?: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .insertInto("audit_logs")
    .values({
      action: e.action,
      user_id: e.userId ?? null,
      entity_type: e.entityType ?? null,
      entity_id: e.entityId ?? null,
      ip_address: e.ip ?? null,
      user_agent: e.userAgent ?? null,
      details: JSON.stringify(e.details ?? {}),
    })
    .execute();
}
