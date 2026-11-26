import type { DB } from "@upskill/db";

export const duties = {
  registrar: "งานทะเบียน", finance: "งานการเงิน", academic: "งานวิชาการ",
  documents: "งานเอกสาร", support: "งานช่วยเหลือ", technical: "ผู้ดูแลเทคนิค", auditor: "ผู้ตรวจสอบ",
} as const;
export type Duty = keyof typeof duties;
export type Resource = keyof typeof resources;
export type Scope = "global"|"course"|"cohort"|"enrollment"|"lesson"|"attempt"|"assignment"|"activity";

function entry<T extends keyof DB>(table:T, title:string, duty:Duty, scope:Scope, fields:readonly (keyof DB[T] & string)[]) {
  return {table,title,duty,scope,fields:fields as readonly string[]};
}

// Only fields in this projection may be read, searched, sorted or exported.
// Operational secrets, uploaded content, answers and personal identity fields stay in their original services.
export const resources = {
  users:entry("users","สถานะสมาชิก","registrar","global",["id","username","role","status","created_at"]),
  profiles:entry("user_profiles","การบันทึกข้อมูลผู้เรียน","registrar","global",["user_id","pdpa_notice_version","pdpa_consented_at","updated_at"]),
  portraits:entry("enrollment_portraits","รายการรูปใบลงทะเบียน","registrar","enrollment",["enrollment_id","content_type","created_at"]),
  emails:entry("user_emails","สถานะอีเมลสมาชิก","support","global",["id","user_id","is_primary","verified_at"]),
  oauth:entry("user_oauth_accounts","การเชื่อมบัญชี","support","global",["id","user_id","provider","linked_at","last_used_at"]),
  sessions:entry("user_sessions","เซสชันผู้ใช้","support","global",["id","user_id","created_at","expires_at","revoked_at"]),
  resets:entry("password_reset_tokens","สถานะลิงก์กู้บัญชี","support","global",["id","user_id","reset_method","expires_at","used_at"]),
  verification:entry("email_verification_tokens","สถานะลิงก์ยืนยันอีเมล","support","global",["id","user_id","expires_at","used_at"]),
  tokens:entry("user_api_tokens","สิทธิ์ API สมาชิก","technical","global",["id","user_id","created_at","revoked_at"]),
  recovery:entry("recovery_cases","เรื่องกู้บัญชี","support","global",["id","category","status","created_at","updated_at"]),
  recoveryEvents:entry("recovery_case_events","เหตุการณ์กู้บัญชี","support","global",["id","case_id","status","created_at"]),
  recoveryStaff:entry("recovery_staff","หน้าที่กู้บัญชี","support","global",["user_id","duty","updated_at"]),
  invitations:entry("instructor_invitations","คำเชิญผู้สอน","academic","global",["id","status","created_at","expires_at"]),
  groups:entry("learning_groups","กลุ่มผู้เรียน","academic","global",["id","name","created_at","updated_at"]),
  members:entry("learning_group_members","สมาชิกกลุ่ม","academic","global",["group_id","user_id","added_at"]),
  courses:entry("courses","รายวิชา","academic","course",["id","title","course_type","visibility","updated_at"]),
  units:entry("course_units","หน่วยการเรียน","academic","course",["id","course_id","title","sequence_order","updated_at"]),
  lessons:entry("lessons","บทเรียน","academic","course",["id","course_id","title","sequence_order","duration_sec","video_status"]),
  programCourses:entry("program_courses","รายวิชาในหลักสูตร","academic","course",["program_id","course_id","is_required","sequence_order"]),
  programs:entry("programs","หลักสูตรอบรม","academic","global",["id","title","category","visibility","updated_at"]),
  cohorts:entry("program_cohorts","รอบอบรม","registrar","cohort",["id","title","status","capacity","starts_at","ends_at"]),
  registrations:entry("cohort_registrations","ทะเบียนผู้สมัครรอบอบรม","registrar","cohort",["id","cohort_id","user_id","status","applied_at","decided_at"]),
  watches:entry("cohort_watches","การติดตามรอบอบรม","registrar","cohort",["id","cohort_id","user_id","created_at"]),
  enrollments:entry("enrollments","การลงทะเบียนเรียน","registrar","course",["id","course_id","cohort_id","user_id","status","enrolled_at"]),
  applications:entry("course_applications","ใบสมัครเรียน","registrar","course",["id","course_id","application_no","user_id","status","verification_status","updated_at"]),
  payments:entry("course_applications","การชำระเงินตามใบสมัคร","finance","course",["id","course_id","application_no","payment_status","receipt_no","updated_at"]),
  files:entry("course_application_files","รายการเอกสารสมัคร","registrar","course",["id","course_id","application_id","doc_key","content_type","superseded_at"]),
  assignments:entry("course_assignments","งานมอบหมาย","academic","course",["id","course_id","status","due_at","created_at"]),
  recipients:entry("course_assignment_recipients","ผู้รับงานมอบหมาย","academic","assignment",["assignment_id","user_id","assigned_at","cancelled_at"]),
  activities:entry("lesson_activities","กิจกรรมในบทเรียน","academic","lesson",["id","lesson_id","activity_type","is_active","sequence_order"]),
  results:entry("lesson_activity_results","ผลกิจกรรม","academic","enrollment",["id","enrollment_id","activity_id","attempt_count","passed_at","score"]),
  videos:entry("video_reports","การแจ้งปัญหาวิดีโอ","academic","lesson",["id","lesson_id","error_code","created_at","resolved_at"]),
  learning:entry("learning_sessions","เซสชันการเรียน","academic","enrollment",["id","enrollment_id","lesson_id","started_at","ended_at","end_reason"]),
  progress:entry("lesson_progress","ความก้าวหน้า","academic","enrollment",["id","enrollment_id","lesson_id","accumulated_valid_sec","is_completed"]),
  checkpoints:entry("checkpoint_attempts","ผลจุดตรวจบทเรียน","academic","lesson",["id","lesson_id","user_id","attempt_count","score","locked_at"]),
  questions:entry("quiz_questions","คลังข้อสอบ","academic","course",["id","course_id","assessment_type","is_active","created_at"]),
  attempts:entry("quiz_attempts","ผลการสอบ","academic","enrollment",["id","enrollment_id","assessment_type","started_at","submitted_at","score_percentage"]),
  lockouts:entry("quiz_lockout_resets","การปลดล็อกข้อสอบ","academic","enrollment",["id","enrollment_id","assessment_type","reset_at"]),
  corrections:entry("quiz_score_corrections","การปรับคะแนน","academic","course",["id","course_id","attempt_id","old_score_percentage","new_score_percentage","applied_at"]),
  anticheat:entry("anticheat_events","เหตุการณ์ระหว่างเรียน","academic","lesson",["id","lesson_id","user_id","reason","created_at"]),
  focus:entry("assessment_focus_events","เหตุการณ์ระหว่างสอบ","academic","attempt",["id","attempt_id","event_type","created_at"]),
  certificates:entry("certificates","วุฒิบัตรและเอกสารรับรอง","documents","course",["id","certificate_code","course_id","cohort_id","issued_at","revoked_at"]),
  announcements:entry("announcements","ประกาศ","support","cohort",["id","cohort_id","title","visibility","publish_at"]),
  messages:entry("support_messages","รายการติดต่อเจ้าหน้าที่","support","global",["id","member_id","created_at"]),
  outbox:entry("email_outbox","คิวส่งอีเมล","technical","global",["id","template_key","status","attempt_count","created_at","sent_at","last_error_code"]),
  delivery:entry("email_delivery_events","สถานะจากผู้ส่งอีเมล","technical","global",["id","outbox_id","event_type","occurred_at"]),
  suppressions:entry("email_suppressions","สถานะระงับการส่งอีเมล","technical","global",["created_at","reason"]),
  preferences:entry("email_preferences","การตั้งค่ารับข่าว","support","global",["user_id","weekly_summary_enabled","course_updates_enabled","updated_at"]),
  smtp:entry("email_provider_settings","บริการส่งอีเมล","technical","global",["id","enabled","version","last_test_status","updated_at"]),
  google:entry("google_oauth_settings","บริการเข้าสู่ระบบ Google","technical","global",["id","enabled","version","updated_at"]),
  settings:entry("system_settings","การตั้งค่าระบบ","technical","global",["key","updated_at"]),
  clients:entry("partner_api_clients","ระบบภายนอกที่เชื่อมต่อ","technical","global",["id","name","created_at","expires_at","revoked_at"]),
  requests:entry("partner_api_requests","ประวัติเรียก API","technical","global",["id","client_id","status","created_at"]),
  audit:entry("audit_logs","บันทึกตรวจสอบ","auditor","global",["id","action","entity_type","created_at"]),
} as const;
