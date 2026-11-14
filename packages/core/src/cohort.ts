// Training cohorts: the phase a cohort is in is derived from its dates and the current time, never stored,
// so a missed background job can't leave registration open after the closing date.

export type CohortState = "draft" | "published" | "cancelled";
export type CohortPhase = "draft" | "scheduled" | "open" | "closed" | "in_progress" | "completed" | "cancelled";

export interface CohortTimeline {
  state: CohortState;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  startsAt: Date;
  endsAt: Date;
}

export function deriveCohortPhase(c: CohortTimeline, now: Date): CohortPhase {
  if (c.state === "draft") return "draft";
  if (c.state === "cancelled") return "cancelled";
  const t = now.getTime();
  if (t >= c.endsAt.getTime()) return "completed";
  if (t >= c.startsAt.getTime() && t >= c.registrationClosesAt.getTime()) return "in_progress";
  if (t < c.registrationOpensAt.getTime()) return "scheduled";
  if (t < c.registrationClosesAt.getTime()) return "open";
  return "closed";
}

/** Dates entered by an admin: every rule the database CHECK enforces, as readable messages */
export function validateCohortDates(c: Omit<CohortTimeline, "state">): string[] {
  const problems: string[] = [];
  const ok = (d: Date) => !Number.isNaN(d.getTime());
  if (![c.registrationOpensAt, c.registrationClosesAt, c.startsAt, c.endsAt].every(ok)) return ["วันที่ไม่ถูกต้อง"];
  if (c.registrationOpensAt >= c.registrationClosesAt) problems.push("วันปิดรับสมัครต้องอยู่หลังวันเปิดรับสมัคร");
  if (c.startsAt >= c.endsAt) problems.push("วันสิ้นสุดการอบรมต้องอยู่หลังวันเริ่มอบรม");
  if (c.registrationClosesAt > c.endsAt) problems.push("ต้องปิดรับสมัครก่อนสิ้นสุดการอบรม");
  return problems;
}

export interface SeatState {
  capacity: number | null;
  /** approved + pending: both hold a seat until an admin decides */
  taken: number;
  waitlistEnabled: boolean;
}

export type SeatDecision = "seat" | "waitlist" | "full";

export function decideSeat(s: SeatState): SeatDecision {
  if (s.capacity === null || s.taken < s.capacity) return "seat";
  return s.waitlistEnabled ? "waitlist" : "full";
}

export function seatsLeft(s: Pick<SeatState, "capacity" | "taken">): number | null {
  return s.capacity === null ? null : Math.max(0, s.capacity - s.taken);
}

export const PROGRAM_PUBLISH_RULES = { minCourses: 1, minSummaryLength: 10 } as const;

export interface ProgramPublishCheck {
  title: string;
  summary: string | null;
  courses: Array<{ title: string; visibility: string; brokenLessons: number; lessons: number }>;
}

export function programPublishProblems(p: ProgramPublishCheck): string[] {
  const problems: string[] = [];
  if (p.courses.length < PROGRAM_PUBLISH_RULES.minCourses) problems.push("ต้องมีรายวิชาอย่างน้อย 1 วิชา");
  if ((p.summary?.trim().length ?? 0) < PROGRAM_PUBLISH_RULES.minSummaryLength) problems.push("ต้องมีคำโปรยอย่างน้อย 10 ตัวอักษร");
  for (const c of p.courses) {
    if (c.visibility !== "published" && c.visibility !== "unlisted") problems.push(`รายวิชา "${c.title}" ยังไม่ได้เผยแพร่`);
    else if (c.lessons === 0) problems.push(`รายวิชา "${c.title}" ยังไม่มีบทเรียน`);
    else if (c.brokenLessons > 0) problems.push(`รายวิชา "${c.title}" มีวิดีโอที่ใช้งานไม่ได้`);
  }
  return problems;
}
