import { describe, expect, it } from "vitest";
import { emailCategory, renderEmail, type EmailJob } from "./mailer.ts";

const jobs: EmailJob[] = [
  { template: "verify-email", to: "a@example.com", link: "https://example.com/verify?t=1" },
  { template: "reset-password", to: "a@example.com", link: "https://example.com/reset?t=1" },
  { template: "password-changed", to: "a@example.com" },
  { template: "account-status-changed", to: "a@example.com", statusLabel: "active" },
  { template: "enrollment-confirmed", to: "a@example.com", courseTitle: "Course", courseLink: "https://example.com/course", enrolledAt: "2026-11-13" },
  { template: "course-assigned", to: "a@example.com", courseTitle: "Course", courseLink: "https://example.com/course", assignedBy: "Admin", dueAt: "2026-11-20", note: "Note" },
  { template: "assignment-cancelled", to: "a@example.com", courseTitle: "Course" },
  { template: "enrollment-cancelled", to: "a@example.com", courseTitle: "Course" },
  { template: "course-suspended", to: "a@example.com", courseTitle: "Course" },
  { template: "ready-for-quiz", to: "a@example.com", courseTitle: "Course", quizLink: "https://example.com/quiz" },
  { template: "assessment-passed", to: "a@example.com", courseTitle: "Course", score: "90.00", certificateLink: "https://example.com/certificate", legalNameRequired: true },
  { template: "assessment-not-passed", to: "a@example.com", courseTitle: "Course", score: "50.00", passingScore: "80", canRetry: true, quizLink: "https://example.com/quiz" },
  { template: "credential-requested", to: "a@example.com", documentName: "Certificate", courseTitle: "Course", code: "CERT-1" },
  { template: "credential-ready", to: "a@example.com", documentName: "Certificate", courseTitle: "Course", code: "CERT-1", downloadLink: "https://example.com/download", verifyLink: "https://example.com/verify" },
  { template: "credential-revoked", to: "a@example.com", documentName: "Certificate", courseTitle: "Course", code: "CERT-1", reason: "Reason", verifyLink: "https://example.com/verify" },
  { template: "assignment-due-reminder", to: "a@example.com", courseTitle: "Course", courseLink: "https://example.com/course", dueAt: "2026-11-20" },
  { template: "weekly-summary", to: "a@example.com", inProgress: 1, completed: 2, dashboardLink: "https://example.com/dashboard" },
  { template: "video-broken", to: "a@example.com", courseTitle: "Course", lessonTitle: "Lesson", manageLink: "https://example.com/manage" },
  { template: "course-status-changed", to: "a@example.com", courseTitle: "Course", statusLabel: "published", manageLink: "https://example.com/manage" },
  { template: "system-alert", to: "a@example.com", title: "Alert", details: "Details", manageLink: "https://example.com/admin" },
  { template: "cohort-application-received", to: "a@example.com", programTitle: "Program", cohortTitle: "Cohort 1", waitlisted: true, programLink: "https://example.com/programs/p" },
  { template: "cohort-application-approved", to: "a@example.com", programTitle: "Program", cohortTitle: "Cohort 1", startsAt: "2026-12-15", programLink: "https://example.com/programs/p" },
  { template: "cohort-application-rejected", to: "a@example.com", programTitle: "Program", cohortTitle: "Cohort 1", note: "Full" },
  { template: "cohort-cancelled", to: "a@example.com", programTitle: "Program", cohortTitle: "Cohort 1" },
  { template: "cohort-starting", to: "a@example.com", programTitle: "Program", cohortTitle: "Cohort 1", startsAt: "2026-12-15", programLink: "https://example.com/programs/p" },
  { template: "announcement", to: "a@example.com", title: "Open day", summary: "Join us", link: "https://example.com/announcements/a" },
];

describe("email templates", () => {
  it.each(jobs)("renders $template in Thai and English", (job) => {
    for (const locale of ["th", "en"] as const) {
      const rendered = renderEmail({ ...job, locale } as EmailJob);
      expect(rendered.subject.length).toBeGreaterThan(0);
      expect(rendered.text).not.toContain("undefined");
      expect(rendered.html).not.toContain("undefined");
    }
  });

  it("escapes values in HTML", () => {
    const rendered = renderEmail({ template: "system-alert", to: "a@example.com", title: "<script>", details: "a&b" });
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).toContain("a&amp;b");
    expect(rendered.html).not.toContain("<script>");
  });

  it("classifies non-optional account email as security", () => {
    expect(emailCategory("verify-email")).toBe("security");
    expect(emailCategory("weekly-summary")).toBe("learning_reminder");
  });
});
