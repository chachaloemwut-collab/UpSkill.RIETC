import { describe, expect, it } from "vitest";
import { decideSeat, deriveCohortPhase, programPublishProblems, seatsLeft, validateCohortDates, type CohortTimeline } from "./cohort.ts";

const d = (s: string) => new Date(`${s}T00:00:00+07:00`);
const cohort: CohortTimeline = {
  state: "published",
  registrationOpensAt: d("2026-12-01"),
  registrationClosesAt: d("2026-12-10"),
  startsAt: d("2026-12-15"),
  endsAt: d("2027-01-15"),
};

describe("deriveCohortPhase", () => {
  it.each([
    ["2026-11-30", "scheduled"],
    ["2026-12-01", "open"],
    ["2026-12-09", "open"],
    ["2026-12-10", "closed"],
    ["2026-12-15", "in_progress"],
    ["2027-01-15", "completed"],
  ])("on %s the cohort is %s", (day, phase) => {
    expect(deriveCohortPhase(cohort, d(day))).toBe(phase);
  });

  it("draft and cancelled override the dates", () => {
    expect(deriveCohortPhase({ ...cohort, state: "draft" }, d("2026-12-05"))).toBe("draft");
    expect(deriveCohortPhase({ ...cohort, state: "cancelled" }, d("2026-12-05"))).toBe("cancelled");
  });

  it("keeps registration open while training has already started (rolling intake)", () => {
    const rolling = { ...cohort, startsAt: d("2026-12-05") };
    expect(deriveCohortPhase(rolling, d("2026-12-07"))).toBe("open");
    expect(deriveCohortPhase(rolling, d("2026-12-11"))).toBe("in_progress");
  });
});

describe("validateCohortDates", () => {
  it("accepts a valid timeline", () => expect(validateCohortDates(cohort)).toEqual([]));
  it("rejects closing before opening and ending before starting", () => {
    const bad = { ...cohort, registrationClosesAt: d("2026-11-01"), endsAt: d("2026-12-14") };
    expect(validateCohortDates(bad)).toHaveLength(2);
  });
  it("rejects registration closing after the training ends", () => {
    expect(validateCohortDates({ ...cohort, registrationClosesAt: d("2027-02-01") })).toContain("ต้องปิดรับสมัครก่อนสิ้นสุดการอบรม");
  });
  it("rejects invalid dates", () => expect(validateCohortDates({ ...cohort, startsAt: new Date("nope") })).toEqual(["วันที่ไม่ถูกต้อง"]));
});

describe("seats", () => {
  it("unlimited capacity always seats", () => expect(decideSeat({ capacity: null, taken: 999, waitlistEnabled: false })).toBe("seat"));
  it("seats until full, then waitlists or refuses", () => {
    expect(decideSeat({ capacity: 2, taken: 1, waitlistEnabled: false })).toBe("seat");
    expect(decideSeat({ capacity: 2, taken: 2, waitlistEnabled: true })).toBe("waitlist");
    expect(decideSeat({ capacity: 2, taken: 2, waitlistEnabled: false })).toBe("full");
  });
  it("never reports negative seats", () => expect(seatsLeft({ capacity: 2, taken: 5 })).toBe(0));
});

describe("programPublishProblems", () => {
  const course = { title: "A", visibility: "unlisted", lessons: 2, brokenLessons: 0 };
  it("passes a complete program", () => expect(programPublishProblems({ title: "P", summary: "หลักสูตรสำหรับครู", courses: [course] })).toEqual([]));
  it("lists every problem", () => {
    const problems = programPublishProblems({
      title: "P",
      summary: "",
      courses: [{ ...course, visibility: "draft" }, { ...course, title: "B", brokenLessons: 1 }],
    });
    expect(problems).toHaveLength(3);
  });
  it("requires at least one course", () => expect(programPublishProblems({ title: "P", summary: "หลักสูตรสำหรับครู", courses: [] })).toHaveLength(1));
});
