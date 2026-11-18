/**
 * End-to-end: a course organised in learning units, with free navigation ("seek anywhere, but watch every
 * part") and the combined end-of-clip score as the pass rule (no post-test). Also covers the softer
 * checkpoint penalty and checkpoint-gated lesson completion.
 */
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { Client, SEED_PASSWORD, resetRateLimits, sleep, withDb } from "./helpers.ts";

const run = randomBytes(4).toString("hex");
const instructor = new Client();
let learner: Client;
let learnerEmail = "";

let courseId = "";
let unitA = "";
let unitB = "";
const lessonIds: string[] = [];

/** A verified member with a complete profile and a live session (sign-up itself is covered by flow.e2e.ts). */
async function makeLearner(): Promise<{ client: Client; email: string }> {
  const email = `units-${run}@e2e.test`;
  const token = randomBytes(32).toString("base64url");
  await withDb(async (db) => {
    const u = await db.query("insert into users (email, email_verified_at, role, status) values ($1, now(), 'member', 'active') returning id", [email]);
    await db.query(
      `insert into user_profiles (user_id, title_th, first_name_th, last_name_th, title_en, first_name_en, last_name_en, phone, birth_date,
         address_line, subdistrict, district, province, postal_code, national_id_hmac, national_id_encrypted, national_id_last4,
         pdpa_notice_version, pdpa_consented_at)
       values ($1, 'นาย', 'ทดสอบ', 'หน่วย', 'Mr.', 'Test', 'Units', '0812345678', '1995-01-01', '1', 'ในเมือง', 'เมือง', 'ระยอง', '21000',
         $2, 'v1.test', '0000', 'test', now())`,
      [u.rows[0].id, randomBytes(32)],
    );
    await db.query(
      "insert into user_sessions (user_id, token_hash, ip_address, user_agent, idle_expires_at, expires_at) values ($1, $2, '127.0.0.1', 'e2e', now() + interval '1 day', now() + interval '1 day')",
      [u.rows[0].id, createHash("sha256").update(token).digest()],
    );
  });
  const client = new Client();
  client.cookies.set([...instructor.cookies.keys()].find((k) => /^(__Host-)?sid$/.test(k)) ?? "sid", token);
  return { client, email };
}

const answerKey = async (attemptId: string, right: boolean) => {
  const snap = await withDb((db) => db.query("select questions_snapshot from quiz_attempts where id = $1", [attemptId]));
  return Object.fromEntries(snap.rows[0].questions_snapshot.map((q: any) => [q.questionId, right ? q.correctOptionId : "deadbeef"]));
};

beforeAll(async () => {
  await resetRateLimits();
  await instructor.login("instructor@upskill.test", SEED_PASSWORD);
  ({ client: learner, email: learnerEmail } = await makeLearner());
});

describe("instructor organises a course in learning units", () => {
  it("creates the course, three clips and two units with summaries", async () => {
    const c = await instructor.req("/api/instructor/courses", { body: { title: `E2E units ${run}`, description: "units" } });
    expect(c.status).toBe(200);
    courseId = c.json.id;
    for (let i = 1; i <= 3; i++) {
      const l = await instructor.req(`/api/instructor/courses/${courseId}/lessons`, { body: { url: "https://youtu.be/aqz-KE-bpKQ", title: `Clip ${i}`, dev_duration_sec: 300 } });
      expect(l.status).toBe(200);
      lessonIds.push(l.json.id);
    }
    const a = await instructor.req(`/api/instructor/courses/${courseId}/units`, { body: { title: "หน่วยที่ทดสอบ A", summary: "บทความสรุป A" } });
    const b = await instructor.req(`/api/instructor/courses/${courseId}/units`, { body: { title: "หน่วยที่ทดสอบ B" } });
    expect(a.status).toBe(200);
    expect(b.json.sequence_order).toBe(2);
    unitA = a.json.id;
    unitB = b.json.id;
  });

  it("assigns clips to units with a caution note, and rejects a unit from another course", async () => {
    for (const [i, id] of lessonIds.entries()) {
      const r = await instructor.req(`/api/instructor/courses/${courseId}/lessons/${id}`, {
        method: "PATCH",
        body: { unit_id: i < 2 ? unitA : unitB, description: "ช่องผู้ผลิต: E2E", ...(i === 0 ? { learner_note: "ในคลิปใช้ตะปูเข็ม" } : {}) },
      });
      expect(r.status).toBe(200);
    }
    const foreign = await instructor.req(`/api/instructor/courses/${courseId}/lessons/${lessonIds[0]}`, { method: "PATCH", body: { unit_id: "00000000-0000-7000-8000-000000000000" } });
    expect(foreign.json.error).toBe("UNIT_NOT_IN_COURSE");
    const rows = await withDb((db) => db.query("select unit_id, learner_note from lessons where course_id = $1 order by sequence_order", [courseId]));
    expect(rows.rows.map((r) => r.unit_id)).toEqual([unitA, unitA, unitB]);
    expect(rows.rows[0].learner_note).toBe("ในคลิปใช้ตะปูเข็ม");
  });

  it("reorders units and deleting a unit keeps its clips", async () => {
    const extra = await instructor.req(`/api/instructor/courses/${courseId}/units`, { body: { title: "ชั่วคราว" } });
    expect((await instructor.req(`/api/instructor/courses/${courseId}/units/order`, { method: "PUT", body: { unit_ids: [extra.json.id, unitA, unitB] } })).status).toBe(200);
    expect((await instructor.req(`/api/instructor/courses/${courseId}/units/${extra.json.id}`, { method: "DELETE" })).status).toBe(200);
    const units = await withDb((db) => db.query("select id, sequence_order from course_units where course_id = $1 order by sequence_order", [courseId]));
    expect(units.rows).toEqual([{ id: unitA, sequence_order: 1 }, { id: unitB, sequence_order: 2 }]);
  });

  it("uses free navigation + combined end-of-clip score, and publishes without a post-test", async () => {
    const settings = await instructor.req(`/api/instructor/courses/${courseId}`, {
      method: "PATCH",
      body: { navigation_mode: "free_complete", completion_rule: "lesson_tests_average", passing_quiz_score: 60, is_sequential_locked: false },
    });
    expect(settings.status).toBe(200);
    for (const id of lessonIds) {
      const q = await instructor.req(`/api/instructor/courses/${courseId}/quiz`, {
        body: { question_text: `End of clip ${id.slice(-4)}?`, options: ["right", "wrong"], correct_index: 0, assessment_type: "lesson", lesson_id: id },
      });
      expect(q.status).toBe(200);
    }
    const cp = await instructor.req(`/api/instructor/courses/${courseId}/lessons/${lessonIds[0]}`, {
      method: "PATCH",
      body: { checkpoint: { question: "Checkpoint?", options: ["right", "wrong"], correct_index: 0, at_sec: 120 } },
    });
    expect(cp.status).toBe(200);
    expect((await instructor.req(`/api/instructor/courses/${courseId}/publish`, { method: "PATCH", body: { visibility: "published" } })).status).toBe(200);
  });
});

describe("learner: free navigation and the combined score", () => {
  let token = "";
  let seq = 0;
  const hb = (lessonId: string, pos: number) => learner.req(`/api/learning/lessons/${lessonId}/heartbeat`, { body: { stream_token: token, seq: ++seq, current_second: pos } });

  it("opens any clip (no sequential lock) and seeks ahead without an anti-cheat flag", async () => {
    expect((await learner.req(`/api/courses/${courseId}/enroll`, { method: "POST" })).status).toBe(200);
    const s = await learner.req(`/api/learning/lessons/${lessonIds[2]}/start-session`, { method: "POST" });
    expect(s.status).toBe(200);
    expect(Array.isArray(s.json.watchedChunks)).toBe(true);
    token = s.json.streamToken;
    expect((await hb(lessonIds[2]!, 0)).json.status).toBe("resync");
    await sleep(3_000);
    expect((await hb(lessonIds[2]!, 3)).json.status).toBe("credited");
    await sleep(2_100);
    const jump = await hb(lessonIds[2]!, 200);
    expect(jump.json.status).toBe("resync");
    expect(jump.json.warning).toBeUndefined();
    await sleep(3_000);
    const after = await hb(lessonIds[2]!, 203);
    expect(after.json.status).toBe("credited");
    expect(after.json.watchedChunks).toContain(20); // 200..203 counts even though 3..200 was skipped
    expect(after.json.isCompleted).toBe(false);
  });

  it("has no post-test in this course", async () => {
    expect((await learner.req(`/api/courses/${courseId}/assessments/start`, { body: { kind: "post" } })).json.error).toBe("POST_TEST_NOT_USED");
  });

  it("(test helper) marks clips 2–3 watched in full, clip 1 watched but held by its unanswered checkpoint", async () => {
    await withDb((db) =>
      db.query(
        `insert into lesson_progress (enrollment_id, lesson_id, total_chunks_required, watched_chunks, accumulated_valid_sec, max_watched_sec, is_completed, completed_at)
         select e.id, l.id, 30, (select array_agg(g) from generate_series(0, 29) g), 300, 300, l.sequence_order > 1, case when l.sequence_order > 1 then now() end
         from enrollments e join users u on u.id = e.user_id join lessons l on l.course_id = e.course_id
         where u.email = $1 and e.course_id = $2
         on conflict (enrollment_id, lesson_id) do update set watched_chunks = excluded.watched_chunks, accumulated_valid_sec = 300,
           max_watched_sec = 300, is_completed = excluded.is_completed, completed_at = excluded.completed_at`,
        [learnerEmail, courseId],
      ),
    );
  });

  it("3 wrong checkpoint answers only rewind the minute before the question", async () => {
    for (let i = 0; i < 2; i++) expect((await learner.req(`/api/learning/lessons/${lessonIds[0]}/checkpoint`, { body: { option_index: 1 } })).json.locked).toBe(false);
    const locked = await learner.req(`/api/learning/lessons/${lessonIds[0]}/checkpoint`, { body: { option_index: 1 } });
    expect(locked.json.locked).toBe(true);
    expect(locked.json.rewatch).toEqual({ fromSec: 60, toSec: 130 });
    const p = await withDb((db) => db.query("select watched_chunks, last_position_sec from lesson_progress where lesson_id = $1", [lessonIds[0]]));
    expect(p.rows[0].watched_chunks).toEqual([0, 1, 2, 3, 4, 5, ...Array.from({ length: 17 }, (_, i) => i + 13)]);
    expect(p.rows[0].last_position_sec).toBe(60);
  });

  it("after rewatching, a correct checkpoint answer completes the clip", async () => {
    // Starting the clip again re-arms the locked checkpoint; then the rewatched part is restored (helper)
    expect((await learner.req(`/api/learning/lessons/${lessonIds[0]}/start-session`, { method: "POST" })).status).toBe(200);
    await withDb((db) => db.query("update lesson_progress set watched_chunks = (select array_agg(g) from generate_series(0, 29) g) where lesson_id = $1", [lessonIds[0]]));
    const ok = await learner.req(`/api/learning/lessons/${lessonIds[0]}/checkpoint`, { body: { option_index: 0 } });
    expect(ok.json.correct).toBe(true);
    expect(ok.json.lessonCompleted).toBe(true);
  });

  it("answering every end-of-clip test completes the course once the combined score reaches 60% (2/3)", async () => {
    const answer = async (lessonId: string, right: boolean) => {
      const start = await learner.req(`/api/courses/${courseId}/assessments/start`, { body: { kind: "lesson", lesson_id: lessonId } });
      expect(start.status).toBe(200);
      return learner.req(`/api/courses/${courseId}/assessments/submit`, { body: { attempt_id: start.json.attemptId, answers: await answerKey(start.json.attemptId, right) } });
    };
    const first = await answer(lessonIds[0]!, true);
    expect(first.json.courseCompleted).toBe(false);
    const second = await answer(lessonIds[1]!, false); // wrong, but answered -> moves on
    expect(second.json.passed).toBe(false);
    expect(second.json.courseCompleted).toBe(false);
    expect(second.json.lessonTests).toMatchObject({ answered: 2, tests: 3, correct: 1 });
    const third = await answer(lessonIds[2]!, true);
    expect(third.json.courseCompleted).toBe(true);
    expect(third.json.lessonTests).toMatchObject({ answered: 3, correct: 2, passed: true });
    const e = await withDb((db) => db.query("select e.status from enrollments e join users u on u.id = e.user_id where u.email = $1 and e.course_id = $2", [learnerEmail, courseId]));
    expect(e.rows[0].status).toBe("completed");
  });

  it("issues the certificate with the combined score", async () => {
    expect((await learner.req("/api/user/lock-legal-name", { body: { legal_full_name_th: "ทดสอบ หน่วย", confirm: true } })).status).toBe(200);
    const cert = await learner.req(`/api/courses/${courseId}/certificate/issue`, { body: { locale: "th" } });
    expect(cert.json.created).toBe(true);
    const row = await withDb((db) => db.query("select quiz_score_snapshot::float as s from certificates where certificate_code = $1", [cert.json.code]));
    expect(row.rows[0].s).toBeCloseTo(66.67, 1);
  });
});
