import "server-only";
import { ctx } from "./context";
import { HttpError } from "./http";
import type { CurrentUser } from "./auth/session";

export async function enrollmentEvidence(actor: CurrentUser, id: string) {
  const record = await ctx().db.selectFrom("enrollments as e")
    .innerJoin("courses as c", "c.id", "e.course_id").innerJoin("users as u", "u.id", "e.user_id")
    .leftJoin("user_profiles as p", "p.user_id", "u.id")
    .leftJoin("certificates as cert", "cert.enrollment_id", "e.id")
    .leftJoin("course_applications as a", "a.enrollment_id", "e.id")
    .leftJoin("enrollment_portraits as photo", "photo.enrollment_id", "e.id")
    .select(["e.id","e.user_id","e.status","e.enrolled_at","e.completed_at","c.id as course_id","c.title","c.slug","c.instructor_id",
      "u.legal_full_name_th","p.first_name_th","p.last_name_th","a.application_no","a.id as application_id","a.declaration_name",
      "photo.enrollment_id as portrait","cert.certificate_code","cert.revoked_at","cert.recipient_name_snapshot","cert.course_title_snapshot",
      "cert.quiz_score_snapshot","cert.total_actual_study_sec","cert.issued_at"])
    .where("e.id","=",id)
    .$if(actor.role !== "admin", q => q.where(eb => eb.or([eb("e.user_id","=",actor.id), ...(actor.role === "instructor" ? [eb("c.instructor_id","=",actor.id)] : [])])))
    .executeTakeFirst();
  if (!record) throw new HttpError(404,"NOT_FOUND");
  return record;
}
export async function applicationPortrait(applicationId: string | null) {
  if (!applicationId) return null;
  return ctx().db.selectFrom("course_application_files").select(["id","storage_key","content_type"])
    .where("application_id","=",applicationId).where("doc_key","=","photo").where("superseded_at","is",null)
    .where("content_type","in",["image/jpeg","image/png"]).orderBy("page_no").executeTakeFirst();
}
