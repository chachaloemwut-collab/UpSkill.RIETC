// Email is sent only by the worker (keeps SMTP latency/failures out of web requests).
// The web app enqueues a job on the "email" queue with one of these templates.
import nodemailer from "nodemailer";

export type EmailJob =
  | { template: "verify-email"; to: string; link: string }
  | { template: "reset-password"; to: string; link: string }
  | { template: "password-changed"; to: string }
  | { template: "video-broken"; to: string; courseTitle: string; lessonTitle: string; manageLink: string };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderEmail(job: EmailJob): { subject: string; text: string; html: string } {
  switch (job.template) {
    case "verify-email":
      return {
        subject: "ยืนยันอีเมลของคุณ",
        text: `กดลิงก์เพื่อยืนยันอีเมล (หมดอายุใน 24 ชั่วโมง):\n${job.link}\n\nหากคุณไม่ได้สมัคร ไม่ต้องทำอะไร`,
        html: `<p>กดลิงก์เพื่อยืนยันอีเมล (หมดอายุใน 24 ชั่วโมง)</p><p><a href="${esc(job.link)}">ยืนยันอีเมล</a></p><p>หากคุณไม่ได้สมัคร ไม่ต้องทำอะไร</p>`,
      };
    case "reset-password":
      return {
        subject: "ตั้งรหัสผ่านใหม่",
        text: `กดลิงก์เพื่อตั้งรหัสผ่านใหม่ (หมดอายุใน 15 นาที):\n${job.link}\n\nหากคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้`,
        html: `<p>กดลิงก์เพื่อตั้งรหัสผ่านใหม่ (หมดอายุใน 15 นาที)</p><p><a href="${esc(job.link)}">ตั้งรหัสผ่านใหม่</a></p><p>หากคุณไม่ได้ขอ ไม่ต้องทำอะไร</p>`,
      };
    case "password-changed":
      return {
        subject: "รหัสผ่านของคุณถูกเปลี่ยนแล้ว",
        text: "รหัสผ่านของบัญชีคุณเพิ่งถูกเปลี่ยน และทุกอุปกรณ์ถูกออกจากระบบแล้ว หากไม่ใช่คุณ กรุณาติดต่อผู้ดูแลระบบทันที",
        html: "<p>รหัสผ่านของบัญชีคุณเพิ่งถูกเปลี่ยน และทุกอุปกรณ์ถูกออกจากระบบแล้ว</p><p>หากไม่ใช่คุณ กรุณาติดต่อผู้ดูแลระบบทันที</p>",
      };
    case "video-broken":
      return {
        subject: `วิดีโอในหลักสูตร "${job.courseTitle}" ใช้งานไม่ได้`,
        text: `บทเรียน "${job.lessonTitle}" เล่นไม่ได้ (ถูกลบ/ตั้งเป็นส่วนตัว/ปิดการฝัง) กรุณาเปลี่ยนลิงก์: ${job.manageLink}`,
        html: `<p>บทเรียน <b>${esc(job.lessonTitle)}</b> ในหลักสูตร <b>${esc(job.courseTitle)}</b> เล่นไม่ได้</p><p><a href="${esc(job.manageLink)}">แก้ไขบทเรียน</a></p>`,
      };
  }
}

export function createMailer(smtpUrl: string, from: string) {
  const transport = nodemailer.createTransport(smtpUrl);
  return async (job: EmailJob) => {
    const m = renderEmail(job);
    await transport.sendMail({ from, to: job.to, subject: m.subject, text: m.text, html: m.html });
  };
}
