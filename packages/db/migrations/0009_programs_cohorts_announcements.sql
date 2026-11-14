-- =====================================================================
-- 0009: training programs (a curated set of courses), cohorts with registration windows and
-- eligibility rules, cohort registrations with approval, and public announcements.
--
-- Cohort lifecycle: only the admin-controlled state is stored (draft / published / cancelled).
-- The phase a visitor sees (scheduled, open, closed, in_progress, completed) is always derived from
-- the dates and the current time (packages/core cohort.ts), so it can never drift from reality.
-- =====================================================================

CREATE TABLE programs (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    slug          VARCHAR(255) UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    title         VARCHAR(255) NOT NULL CHECK (char_length(title) >= 3),
    summary       VARCHAR(500),
    description   TEXT CHECK (description IS NULL OR char_length(description) <= 20000),
    category      VARCHAR(60),
    visibility    VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (visibility IN ('draft','published','unlisted','archived')),
    created_by    UUID NOT NULL REFERENCES users(id),
    published_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_programs_updated BEFORE UPDATE ON programs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_programs_public ON programs (published_at DESC) WHERE visibility = 'published';

CREATE TABLE program_courses (
    program_id      UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    -- RESTRICT: a course must be removed from its programs before it can be deleted
    course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    sequence_order  INT NOT NULL CHECK (sequence_order > 0),
    is_required     BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (program_id, course_id),
    CONSTRAINT uq_program_courses_order UNIQUE (program_id, sequence_order) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX idx_program_courses_course ON program_courses (course_id);

CREATE TABLE program_cohorts (
    id                      UUID PRIMARY KEY DEFAULT uuidv7(),
    program_id              UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    title                   VARCHAR(255) NOT NULL CHECK (char_length(title) >= 1),
    registration_opens_at   TIMESTAMPTZ NOT NULL,
    registration_closes_at  TIMESTAMPTZ NOT NULL,
    starts_at               TIMESTAMPTZ NOT NULL,
    ends_at                 TIMESTAMPTZ NOT NULL,
    capacity                INT CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 100000),
    waitlist_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
    requires_approval       BOOLEAN NOT NULL DEFAULT FALSE,
    -- Eligibility rules + application form; validated by the app (packages/core eligibility.ts)
    eligibility             JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(eligibility) = 'object'),
    status                  VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled')),
    created_by              UUID NOT NULL REFERENCES users(id),
    published_at            TIMESTAMPTZ,
    cancelled_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_cohort_dates CHECK (
        registration_opens_at < registration_closes_at
        AND registration_closes_at <= ends_at
        AND starts_at < ends_at
    ),
    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);
CREATE TRIGGER trg_program_cohorts_updated BEFORE UPDATE ON program_cohorts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_cohorts_program ON program_cohorts (program_id, starts_at);
CREATE INDEX idx_cohorts_public ON program_cohorts (registration_opens_at) WHERE status = 'published';

CREATE TABLE cohort_registrations (
    id             UUID PRIMARY KEY DEFAULT uuidv7(),
    cohort_id      UUID NOT NULL REFERENCES program_cohorts(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected','waitlisted','cancelled')),
    -- Answers to the cohort's application form. Personal data: never logged, exported only with an audit entry.
    answers        JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(answers) = 'object'),
    applied_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at     TIMESTAMPTZ,
    decided_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    decision_note  TEXT CHECK (decision_note IS NULL OR char_length(decision_note) <= 2000),
    cancelled_at   TIMESTAMPTZ,
    UNIQUE (cohort_id, user_id),
    -- A decision keeps its timestamp even if the registration is cancelled later (history)
    CHECK (status NOT IN ('approved','rejected') OR decided_at IS NOT NULL),
    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);
CREATE INDEX idx_registrations_cohort_status ON cohort_registrations (cohort_id, status, applied_at);
CREATE INDEX idx_registrations_user ON cohort_registrations (user_id, applied_at DESC);

-- Which cohort granted this enrollment (NULL = direct enrollment or an assignment)
ALTER TABLE enrollments ADD COLUMN cohort_id UUID REFERENCES program_cohorts(id) ON DELETE SET NULL;
CREATE INDEX idx_enrollments_cohort ON enrollments (cohort_id) WHERE cohort_id IS NOT NULL;

CREATE TABLE announcements (
    id               UUID PRIMARY KEY DEFAULT uuidv7(),
    slug             VARCHAR(255) UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    title            VARCHAR(255) NOT NULL CHECK (char_length(title) >= 3),
    summary          VARCHAR(500),
    body             TEXT NOT NULL CHECK (char_length(body) <= 20000),
    kind             VARCHAR(20) NOT NULL DEFAULT 'event' CHECK (kind IN ('event','news','notice')),
    program_id       UUID REFERENCES programs(id) ON DELETE SET NULL,
    cohort_id        UUID REFERENCES program_cohorts(id) ON DELETE SET NULL,
    location         VARCHAR(255),
    event_starts_at  TIMESTAMPTZ,
    event_ends_at    TIMESTAMPTZ,
    publish_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at       TIMESTAMPTZ,
    is_pinned        BOOLEAN NOT NULL DEFAULT FALSE,
    visibility       VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (visibility IN ('draft','published','archived')),
    broadcast_at     TIMESTAMPTZ,
    created_by       UUID NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (event_ends_at IS NULL OR event_starts_at IS NOT NULL),
    CHECK (event_ends_at IS NULL OR event_ends_at >= event_starts_at),
    CHECK (expires_at IS NULL OR expires_at > publish_at)
);
CREATE TRIGGER trg_announcements_updated BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_announcements_public ON announcements (is_pinned DESC, publish_at DESC) WHERE visibility = 'published';

GRANT SELECT, INSERT, UPDATE, DELETE ON programs, program_courses, program_cohorts, cohort_registrations, announcements TO upskill_app;
GRANT SELECT ON programs, program_courses, program_cohorts, announcements TO upskill_readonly;
-- The read-only role sees registration status but not the application answers (personal data)
GRANT SELECT (id, cohort_id, user_id, status, applied_at, decided_at, decided_by, cancelled_at)
  ON cohort_registrations TO upskill_readonly;
