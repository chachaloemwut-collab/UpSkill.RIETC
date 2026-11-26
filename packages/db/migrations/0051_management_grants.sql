CREATE TABLE management_grants (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id),
  duty text NOT NULL CHECK (duty IN ('registrar','finance','academic','documents','support','technical','auditor')),
  course_id uuid REFERENCES courses(id),
  cohort_id uuid REFERENCES program_cohorts(id),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  can_act boolean NOT NULL DEFAULT false,
  can_export boolean NOT NULL DEFAULT false,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  granted_by uuid NOT NULL REFERENCES users(id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id),
  CHECK (num_nonnulls(course_id,cohort_id) <= 1),
  CHECK (expires_at IS NULL OR expires_at > starts_at),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CHECK (duty <> 'auditor' OR NOT can_act)
);
CREATE INDEX management_grants_lookup ON management_grants(user_id,duty) WHERE revoked_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON management_grants TO upskill_app;
