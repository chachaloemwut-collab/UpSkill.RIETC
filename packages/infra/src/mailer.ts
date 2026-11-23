// Email is sent only by the worker. Every job originates from the database outbox.
import nodemailer from "nodemailer";

export type EmailCategory = "security" | "transactional" | "course_update" | "learning_reminder" | "system";

type EmailJobData =
  | { template: "membership-confirmed"; to: string; name: string; registeredAt: string; verifiedAt: string; applicationLink: string }
  | { template: "verify-email"; to: string; link: string }
  | { template: "reset-password"; to: string; link: string }
  | { template: "password-changed"; to: string }
  | { template: "account-status-changed"; to: string; statusLabel: string }
  | { template: "enrollment-confirmed"; to: string; courseTitle: string; courseLink: string; enrolledAt: string }
  | { template: "course-assigned"; to: string; courseTitle: string; courseLink: string; assignedBy: string; dueAt?: string; note?: string }
  | { template: "assignment-cancelled"; to: string; courseTitle: string }
  | { template: "enrollment-cancelled"; to: string; courseTitle: string }
  | { template: "course-suspended"; to: string; courseTitle: string }
  | { template: "ready-for-quiz"; to: string; courseTitle: string; quizLink: string }
  | { template: "assessment-passed"; to: string; courseTitle: string; score: string; certificateLink: string; legalNameRequired: boolean }
  | { template: "assessment-not-passed"; to: string; courseTitle: string; score: string; passingScore: string; canRetry: boolean; quizLink: string }
  | { template: "credential-requested"; to: string; documentName: string; courseTitle: string; code: string }
  | { template: "credential-ready"; to: string; documentName: string; courseTitle: string; code: string; downloadLink: string; verifyLink: string }
  | { template: "credential-revoked"; to: string; documentName: string; courseTitle: string; code: string; reason: string; verifyLink: string }
  | { template: "assignment-due-reminder"; to: string; courseTitle: string; courseLink: string; dueAt: string }
  | { template: "weekly-summary"; to: string; inProgress: number; completed: number; dashboardLink: string }
  | { template: "video-broken"; to: string; courseTitle: string; lessonTitle: string; manageLink: string }
  | { template: "course-status-changed"; to: string; courseTitle: string; statusLabel: string; manageLink: string }
  | { template: "system-alert"; to: string; title: string; details: string; manageLink?: string }
  | { template: "cohort-application-received"; to: string; programTitle: string; cohortTitle: string; waitlisted: boolean; programLink: string }
  | { template: "cohort-application-approved"; to: string; programTitle: string; cohortTitle: string; startsAt: string; programLink: string }
  | { template: "cohort-application-rejected"; to: string; programTitle: string; cohortTitle: string; note?: string }
  | { template: "cohort-cancelled"; to: string; programTitle: string; cohortTitle: string }
  | { template: "cohort-starting"; to: string; programTitle: string; cohortTitle: string; startsAt: string; programLink: string }
  | { template: "cohort-registration-open"; to: string; programTitle: string; cohortTitle: string; opensAt: string; programLink: string }
  | { template: "announcement"; to: string; title: string; summary: string; link: string }
  | { template: "instructor-invitation"; to: string; link: string; inviterName: string; message?: string };

export type EmailJob = EmailJobData & { locale?: "th" | "en" };

export type EmailTemplate = EmailJob["template"];

const SECURITY = new Set<EmailTemplate>(["verify-email", "reset-password", "password-changed", "account-status-changed"]);
const COURSE_UPDATE = new Set<EmailTemplate>(["course-suspended", "course-status-changed", "cohort-cancelled", "cohort-registration-open", "announcement"]);
const REMINDER = new Set<EmailTemplate>(["assignment-due-reminder", "weekly-summary", "cohort-starting"]);
const SYSTEM = new Set<EmailTemplate>(["video-broken", "system-alert"]);

export function emailCategory(template: EmailTemplate): EmailCategory {
  if (SECURITY.has(template)) return "security";
  if (COURSE_UPDATE.has(template)) return "course_update";
  if (REMINDER.has(template)) return "learning_reminder";
  if (SYSTEM.has(template)) return "system";
  return "transactional";
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const action = (link: string, label: string) => `<p><a href="${esc(link)}">${esc(label)}</a></p>`;
/** Large tappable link for the one action an email exists for (inline styles: mail clients drop <style>) */
const button = (link: string, label: string) =>
  `<p><a href="${esc(link)}" style="display:inline-block;padding:12px 24px;border-radius:8px;background:#2563eb;color:#ffffff;font-weight:600;text-decoration:none">${esc(label)}</a></p>`;
const optionalText = (label: string, value?: string) => (value ? `\n${label}: ${value}` : "");
const optionalHtml = (label: string, value?: string) => (value ? `<p>${esc(label)}: ${esc(value)}</p>` : "");

function renderEmailEn(job: EmailJob): { subject: string; text: string; html: string } {
  const result = (subject: string, text: string, link?: string, label = "Open") => ({ subject, text: `${text}${link ? `\n${link}` : ""}`, html: `<p>${esc(text)}</p>${link ? action(link, label) : ""}` });
  switch (job.template) {
    case "membership-confirmed": return result("Membership application confirmed", `Applicant: ${job.name} · Registered: ${job.registeredAt} · Email verified: ${job.verifiedAt}`, job.applicationLink, "Open application");
    case "verify-email": return result("Verify your email", "Use this link within 24 hours to verify your email. If you did not register, no action is required.", job.link, "Verify email");
    case "reset-password": return result("Set a new password", "Use this link within 1 hour to set a new password. It works once; a newer link replaces older ones. If you did not request this, ignore this email: your current password remains valid.", job.link, "Set password");
    case "password-changed": return result("Your password was changed", "Your account password was changed and other devices were signed out. Contact an administrator if this was not you.");
    case "account-status-changed": return result("Account status changed", `Current account status: ${job.statusLabel}`);
    case "enrollment-confirmed": return result(`Course enrollment recorded: ${job.courseTitle}`, `Enrollment was recorded on ${job.enrolledAt}.`, job.courseLink, "Open course");
    case "course-assigned": return result(`Course assigned: ${job.courseTitle}`, `Assigned by ${job.assignedBy}.${job.dueAt ? ` Due: ${job.dueAt}.` : ""}${job.note ? ` Note: ${job.note}` : ""}`, job.courseLink, "Open course");
    case "assignment-cancelled": return result(`Course assignment cancelled: ${job.courseTitle}`, "This course assignment was cancelled.");
    case "enrollment-cancelled": return result(`Enrollment cancelled: ${job.courseTitle}`, "This course enrollment was cancelled.");
    case "course-suspended": return result(`Course suspended: ${job.courseTitle}`, "This course is currently unavailable.");
    case "ready-for-quiz": return result(`Ready for assessment: ${job.courseTitle}`, "All lessons are complete.", job.quizLink, "Open assessment");
    case "assessment-passed": return result(`Assessment passed: ${job.courseTitle}`, `Score: ${job.score}%.${job.legalNameRequired ? " Confirm your legal name before requesting the document." : ""}`, job.certificateLink, "Continue");
    case "assessment-not-passed": return result(`Assessment result: ${job.courseTitle}`, `Score: ${job.score}%. Passing score: ${job.passingScore}%.${job.canRetry ? " You may try again." : " No further attempt is available at this time."}`, job.canRetry ? job.quizLink : undefined, "Try again");
    case "credential-requested": return result(`${job.documentName} is being prepared`, `${job.courseTitle} · ${job.code}`);
    case "credential-ready": return result(`${job.documentName} is ready: ${job.courseTitle}`, `Document code: ${job.code}. Verification: ${job.verifyLink}`, job.downloadLink, "Download document");
    case "credential-revoked": return result(`${job.documentName} revoked: ${job.code}`, `Course: ${job.courseTitle}. Reason: ${job.reason}.`, job.verifyLink, "Verify status");
    case "assignment-due-reminder": return result(`Course deadline: ${job.courseTitle}`, `Due: ${job.dueAt}`, job.courseLink, "Open course");
    case "weekly-summary": return result("Learning status summary", `In progress: ${job.inProgress}. Completed: ${job.completed}.`, job.dashboardLink, "View status");
    case "video-broken": return result(`Course video unavailable: ${job.courseTitle}`, `Lesson: ${job.lessonTitle}`, job.manageLink, "Manage lesson");
    case "course-status-changed": return result(`Course status changed: ${job.courseTitle}`, `Current status: ${job.statusLabel}`, job.manageLink, "Manage course");
    case "system-alert": return result(`System alert: ${job.title}`, job.details, job.manageLink, "Open administration");
    case "cohort-application-received": return result(`Application received: ${job.programTitle}`, `Cohort: ${job.cohortTitle}. ${job.waitlisted ? "The cohort is full; you are on the waiting list." : "Your application is waiting for review."}`, job.programLink, "View program");
    case "cohort-application-approved": return result(`Application approved: ${job.programTitle}`, `Cohort: ${job.cohortTitle}. Training starts ${job.startsAt}.`, job.programLink, "View program");
    case "cohort-application-rejected": return result(`Application result: ${job.programTitle}`, `Your application for ${job.cohortTitle} was not approved.${job.note ? ` Note: ${job.note}` : ""}`);
    case "cohort-cancelled": return result(`Cohort cancelled: ${job.programTitle}`, `The cohort ${job.cohortTitle} was cancelled.`);
    case "cohort-starting": return result(`Training has started: ${job.programTitle}`, `Cohort: ${job.cohortTitle}. Start: ${job.startsAt}.`, job.programLink, "Start learning");
    case "cohort-registration-open": return result(`Registration open: ${job.programTitle}`, `Cohort: ${job.cohortTitle}. Registration opens ${job.opensAt}.`, job.programLink, "Apply now");
    case "announcement": return result(job.title, job.summary, job.link, "Read more");
    case "instructor-invitation":
      return result(
        "You are invited to teach on UpskillReskill.RIETC",
        `${job.inviterName} invited you to become an instructor.${job.message ? `\nMessage: ${job.message}` : ""}\nThis link is single-use and expires in 7 days.`,
        job.link,
        "Accept invitation",
      );
  }
}

function renderEmailTh(job: EmailJob): { subject: string; text: string; html: string } {
  switch (job.template) {
    case "membership-confirmed": {
      const text = `ผู้สมัคร ${job.name} · สมัครเมื่อ ${job.registeredAt} · ยืนยันอีเมลเมื่อ ${job.verifiedAt}`;
      return { subject: "สำเนาการสมัครสมาชิก", text: text+"\n"+job.applicationLink, html: `<p>${esc(text)}</p>${action(job.applicationLink,"เปิดใบสมัครฉบับเต็ม")}` };
    }
    case "verify-email":
      return { subject: "ยืนยันอีเมลของคุณ", text: `กดลิงก์เพื่อยืนยันอีเมล (หมดอายุใน 24 ชั่วโมง):\n${job.link}\n\nหากคุณไม่ได้สมัคร ไม่ต้องดำเนินการ`, html: `<p>กดลิงก์เพื่อยืนยันอีเมล (หมดอายุใน 24 ชั่วโมง)</p>${action(job.link, "ยืนยันอีเมล")}<p>หากคุณไม่ได้สมัคร ไม่ต้องดำเนินการ</p>` };
    case "reset-password":
      return {
        subject: "ลิงก์ตั้งรหัสผ่านใหม่ (ใช้ได้ 1 ชั่วโมง)",
        text: `มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ กดลิงก์ด้านล่างภายใน 1 ชั่วโมง (ใช้ได้ครั้งเดียว ถ้าขอหลายครั้งให้ใช้อีเมลฉบับล่าสุด):\n${job.link}\n\nหากคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ`,
        html: `<p>มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ</p>${button(job.link, "ตั้งรหัสผ่านใหม่")}<p>ลิงก์ใช้ได้ภายใน 1 ชั่วโมงและใช้ได้ครั้งเดียว ถ้าขอหลายครั้ง ให้ใช้อีเมลฉบับล่าสุด</p><p>หากคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ</p><p style="color:#71717a;font-size:12px">ถ้าปุ่มกดไม่ได้ ให้คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์: ${esc(job.link)}</p>`,
      };
    case "password-changed":
      return { subject: "รหัสผ่านของคุณถูกเปลี่ยนแล้ว", text: "รหัสผ่านของบัญชีถูกเปลี่ยนและอุปกรณ์อื่นถูกออกจากระบบแล้ว หากไม่ใช่คุณ กรุณาติดต่อผู้ดูแลระบบ", html: "<p>รหัสผ่านของบัญชีถูกเปลี่ยนและอุปกรณ์อื่นถูกออกจากระบบแล้ว</p><p>หากไม่ใช่คุณ กรุณาติดต่อผู้ดูแลระบบ</p>" };
    case "account-status-changed":
      return { subject: "สถานะบัญชีถูกเปลี่ยน", text: `สถานะบัญชีปัจจุบัน: ${job.statusLabel}`, html: `<p>สถานะบัญชีปัจจุบัน: <b>${esc(job.statusLabel)}</b></p>` };
    case "enrollment-confirmed":
      return { subject: `ลงทะเบียนหลักสูตรแล้ว: ${job.courseTitle}`, text: `ระบบบันทึกการลงทะเบียนหลักสูตร "${job.courseTitle}" เมื่อ ${job.enrolledAt}\n${job.courseLink}`, html: `<p>ระบบบันทึกการลงทะเบียนหลักสูตร <b>${esc(job.courseTitle)}</b></p><p>วันที่ลงทะเบียน: ${esc(job.enrolledAt)}</p>${action(job.courseLink, "เปิดหลักสูตร")}` };
    case "course-assigned":
      return { subject: `ได้รับมอบหมายหลักสูตร: ${job.courseTitle}`, text: `คุณได้รับมอบหมายหลักสูตร "${job.courseTitle}" โดย ${job.assignedBy}${optionalText("กำหนดเวลา", job.dueAt)}${optionalText("หมายเหตุ", job.note)}\n${job.courseLink}`, html: `<p>คุณได้รับมอบหมายหลักสูตร <b>${esc(job.courseTitle)}</b></p><p>ผู้มอบหมาย: ${esc(job.assignedBy)}</p>${optionalHtml("กำหนดเวลา", job.dueAt)}${optionalHtml("หมายเหตุ", job.note)}${action(job.courseLink, "เปิดหลักสูตร")}` };
    case "assignment-cancelled":
      return { subject: `ยกเลิกการมอบหมายหลักสูตร: ${job.courseTitle}`, text: `การมอบหมายหลักสูตร "${job.courseTitle}" ถูกยกเลิก`, html: `<p>การมอบหมายหลักสูตร <b>${esc(job.courseTitle)}</b> ถูกยกเลิก</p>` };
    case "enrollment-cancelled":
      return { subject: `ยกเลิกการลงทะเบียน: ${job.courseTitle}`, text: `การลงทะเบียนหลักสูตร "${job.courseTitle}" ถูกยกเลิก`, html: `<p>การลงทะเบียนหลักสูตร <b>${esc(job.courseTitle)}</b> ถูกยกเลิก</p>` };
    case "course-suspended":
      return { subject: `หลักสูตรถูกระงับ: ${job.courseTitle}`, text: `หลักสูตร "${job.courseTitle}" ถูกระงับและไม่สามารถเข้าเรียนได้ในขณะนี้`, html: `<p>หลักสูตร <b>${esc(job.courseTitle)}</b> ถูกระงับและไม่สามารถเข้าเรียนได้ในขณะนี้</p>` };
    case "ready-for-quiz":
      return { subject: `พร้อมทำแบบทดสอบ: ${job.courseTitle}`, text: `คุณเรียนครบทุกบทของหลักสูตร "${job.courseTitle}" แล้ว\n${job.quizLink}`, html: `<p>คุณเรียนครบทุกบทของหลักสูตร <b>${esc(job.courseTitle)}</b> แล้ว</p>${action(job.quizLink, "ทำแบบทดสอบ")}` };
    case "assessment-passed":
      return { subject: `ผ่านการประเมิน: ${job.courseTitle}`, text: `ผลการประเมินหลักสูตร "${job.courseTitle}": ผ่าน (${job.score}%)\n${job.legalNameRequired ? "กรุณายืนยันชื่อก่อนขอรับวุฒิบัตร\n" : ""}${job.certificateLink}`, html: `<p>ผลการประเมินหลักสูตร <b>${esc(job.courseTitle)}</b>: ผ่าน (${esc(job.score)}%)</p>${job.legalNameRequired ? "<p>กรุณายืนยันชื่อก่อนขอรับวุฒิบัตร</p>" : ""}${action(job.certificateLink, "ดำเนินการต่อ")}` };
    case "assessment-not-passed":
      return { subject: `ผลการประเมิน: ${job.courseTitle}`, text: `คะแนน ${job.score}% เกณฑ์ผ่าน ${job.passingScore}%\n${job.canRetry ? `สามารถทำใหม่ได้ที่ ${job.quizLink}` : "ไม่สามารถทำใหม่ได้ในขณะนี้"}`, html: `<p>คะแนน ${esc(job.score)}% เกณฑ์ผ่าน ${esc(job.passingScore)}%</p>${job.canRetry ? action(job.quizLink, "ทำแบบทดสอบอีกครั้ง") : "<p>ไม่สามารถทำใหม่ได้ในขณะนี้</p>"}` };
    case "credential-requested":
      return { subject: `วุฒิบัตรอยู่ระหว่างจัดทำ`, text: `วุฒิบัตรสำหรับหลักสูตร "${job.courseTitle}" รหัส ${job.code} อยู่ระหว่างจัดทำ`, html: `<p>วุฒิบัตรสำหรับหลักสูตร <b>${esc(job.courseTitle)}</b> รหัส <b>${esc(job.code)}</b> อยู่ระหว่างจัดทำ</p>` };
    case "credential-ready":
      return { subject: `วุฒิบัตรพร้อมดาวน์โหลด: ${job.courseTitle}`, text: `วุฒิบัตรรหัส ${job.code} พร้อมดาวน์โหลด\nดาวน์โหลด: ${job.downloadLink}\nตรวจสอบ: ${job.verifyLink}`, html: `<p>วุฒิบัตรรหัส <b>${esc(job.code)}</b> พร้อมดาวน์โหลด</p>${action(job.downloadLink, "ดาวน์โหลดวุฒิบัตร")}${action(job.verifyLink, "ตรวจสอบสถานะ")}` };
    case "credential-revoked":
      return { subject: `วุฒิบัตรถูกเพิกถอน: ${job.code}`, text: `วุฒิบัตรสำหรับหลักสูตร "${job.courseTitle}" รหัส ${job.code} ถูกเพิกถอน\nเหตุผล: ${job.reason}\n${job.verifyLink}`, html: `<p>วุฒิบัตรสำหรับหลักสูตร <b>${esc(job.courseTitle)}</b> รหัส <b>${esc(job.code)}</b> ถูกเพิกถอน</p><p>เหตุผล: ${esc(job.reason)}</p>${action(job.verifyLink, "ตรวจสอบสถานะ")}` };
    case "assignment-due-reminder":
      return { subject: `แจ้งกำหนดเวลาหลักสูตร: ${job.courseTitle}`, text: `กำหนดเวลา ${job.dueAt}\n${job.courseLink}`, html: `<p>หลักสูตร <b>${esc(job.courseTitle)}</b></p><p>กำหนดเวลา: ${esc(job.dueAt)}</p>${action(job.courseLink, "เปิดหลักสูตร")}` };
    case "weekly-summary":
      return { subject: "สรุปสถานะการเรียน", text: `กำลังเรียน ${job.inProgress} หลักสูตร เรียนจบ ${job.completed} หลักสูตร\n${job.dashboardLink}`, html: `<p>กำลังเรียน ${job.inProgress} หลักสูตร · เรียนจบ ${job.completed} หลักสูตร</p>${action(job.dashboardLink, "ดูสถานะการเรียน")}` };
    case "video-broken":
      return { subject: `วิดีโอในหลักสูตร "${job.courseTitle}" ใช้งานไม่ได้`, text: `บทเรียน "${job.lessonTitle}" เล่นไม่ได้ กรุณาตรวจสอบ: ${job.manageLink}`, html: `<p>บทเรียน <b>${esc(job.lessonTitle)}</b> ในหลักสูตร <b>${esc(job.courseTitle)}</b> เล่นไม่ได้</p>${action(job.manageLink, "แก้ไขบทเรียน")}` };
    case "course-status-changed":
      return { subject: `สถานะหลักสูตรถูกเปลี่ยน: ${job.courseTitle}`, text: `สถานะปัจจุบัน: ${job.statusLabel}\n${job.manageLink}`, html: `<p>หลักสูตร <b>${esc(job.courseTitle)}</b></p><p>สถานะปัจจุบัน: ${esc(job.statusLabel)}</p>${action(job.manageLink, "จัดการหลักสูตร")}` };
    case "system-alert":
      return { subject: `แจ้งเตือนระบบ: ${job.title}`, text: `${job.details}${job.manageLink ? `\n${job.manageLink}` : ""}`, html: `<p><b>${esc(job.title)}</b></p><p>${esc(job.details)}</p>${job.manageLink ? action(job.manageLink, "เปิดหน้าจัดการ") : ""}` };
    case "cohort-application-received": {
      const status = job.waitlisted ? "รอบนี้ที่นั่งเต็มแล้ว คุณอยู่ในรายชื่อสำรอง" : "ใบสมัครอยู่ระหว่างรอผู้ดูแลพิจารณา";
      return { subject: `ได้รับใบสมัครแล้ว: ${job.programTitle}`, text: `หลักสูตร "${job.programTitle}" รอบ ${job.cohortTitle}\n${status}\n${job.programLink}`, html: `<p>หลักสูตร <b>${esc(job.programTitle)}</b> รอบ ${esc(job.cohortTitle)}</p><p>${esc(status)}</p>${action(job.programLink, "ดูหลักสูตร")}` };
    }
    case "cohort-application-approved":
      return { subject: `อนุมัติการสมัครแล้ว: ${job.programTitle}`, text: `คุณได้รับอนุมัติให้เข้าอบรมหลักสูตร "${job.programTitle}" รอบ ${job.cohortTitle}\nเริ่มอบรม: ${job.startsAt}\n${job.programLink}`, html: `<p>คุณได้รับอนุมัติให้เข้าอบรมหลักสูตร <b>${esc(job.programTitle)}</b> รอบ ${esc(job.cohortTitle)}</p><p>เริ่มอบรม: ${esc(job.startsAt)}</p>${action(job.programLink, "ดูหลักสูตร")}` };
    case "cohort-application-rejected":
      return { subject: `ผลการสมัคร: ${job.programTitle}`, text: `ใบสมัครหลักสูตร "${job.programTitle}" รอบ ${job.cohortTitle} ไม่ได้รับการอนุมัติ${optionalText("หมายเหตุ", job.note)}`, html: `<p>ใบสมัครหลักสูตร <b>${esc(job.programTitle)}</b> รอบ ${esc(job.cohortTitle)} ไม่ได้รับการอนุมัติ</p>${optionalHtml("หมายเหตุ", job.note)}` };
    case "cohort-cancelled":
      return { subject: `ยกเลิกรอบอบรม: ${job.programTitle}`, text: `รอบอบรม ${job.cohortTitle} ของหลักสูตร "${job.programTitle}" ถูกยกเลิก`, html: `<p>รอบอบรม ${esc(job.cohortTitle)} ของหลักสูตร <b>${esc(job.programTitle)}</b> ถูกยกเลิก</p>` };
    case "cohort-starting":
      return { subject: `เริ่มอบรมแล้ว: ${job.programTitle}`, text: `หลักสูตร "${job.programTitle}" รอบ ${job.cohortTitle} เริ่มอบรมแล้ว (${job.startsAt})\n${job.programLink}`, html: `<p>หลักสูตร <b>${esc(job.programTitle)}</b> รอบ ${esc(job.cohortTitle)} เริ่มอบรมแล้ว</p><p>เริ่ม: ${esc(job.startsAt)}</p>${action(job.programLink, "เริ่มเรียน")}` };
    case "cohort-registration-open":
      return { subject: `เปิดรับสมัครแล้ว: ${job.programTitle}`, text: `หลักสูตร "${job.programTitle}" รอบ ${job.cohortTitle} เปิดรับสมัครแล้ว (${job.opensAt})\n${job.programLink}`, html: `<p>หลักสูตร <b>${esc(job.programTitle)}</b> รอบ ${esc(job.cohortTitle)} เปิดรับสมัครแล้ว</p><p>เปิดรับ: ${esc(job.opensAt)}</p>${action(job.programLink, "สมัครเลย")}` };
    case "announcement":
      return { subject: job.title, text: `${job.summary}\n${job.link}`, html: `<p><b>${esc(job.title)}</b></p><p>${esc(job.summary)}</p>${action(job.link, "อ่านรายละเอียด")}` };
    case "instructor-invitation":
      return {
        subject: "คำเชิญเป็นผู้สอนใน UpskillReskill.RIETC",
        text: `${job.inviterName} เชิญคุณเป็นผู้สอน${job.message ? `\nข้อความ: ${job.message}` : ""}\nยืนยันภายใน 7 วัน: ${job.link}`,
        html: `<p><b>${esc(job.inviterName)}</b> เชิญคุณเป็นผู้สอนในระบบ UpskillReskill.RIETC</p>${optionalHtml("ข้อความ", job.message)}<p>ลิงก์นี้ใช้ได้ 7 วันและใช้ได้ครั้งเดียว</p>${action(job.link, "ยอมรับคำเชิญ")}`,
      };
  }
}

// Email clients may block external images, web fonts and animation. Keep the name selectable in both formats.
const emailWordmark = '<p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:18px;font-weight:bold"><span style="color:#16345b">Upskill</span><span style="color:#2563eb">Reskill</span><span style="color:#d4a03d">.</span><span style="color:#475569">RIETC</span></p>';

export function renderEmail(job: EmailJob) {
  const message = job.locale === "en" ? renderEmailEn(job) : renderEmailTh(job);
  return { ...message, html: emailWordmark + message.html, text: `${message.text}\n\nUpskillReskill.RIETC` };
}

export function createMailer(smtpUrl: string, from: string, replyTo?: string | null) {
  const transport = nodemailer.createTransport(smtpUrl);
  return async (job: EmailJob, attachments?: { filename: string; content: Buffer; contentType: string }[]): Promise<{ messageId: string | null }> => {
    const message = renderEmail(job);
    const result = await transport.sendMail({ from, ...(replyTo ? { replyTo } : {}), to: job.to, attachments, subject: message.subject, text: message.text, html: message.html });
    return { messageId: typeof result.messageId === "string" ? result.messageId : null };
  };
}
