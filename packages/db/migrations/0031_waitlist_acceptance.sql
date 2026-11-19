-- I-13: waitlist seat-offer tracking + acceptance deadline
-- When a waitlisted applicant is offered a seat (promoted to pending),
-- record when the offer was sent and optionally expire it.

ALTER TABLE cohort_registrations
  ADD COLUMN waitlist_offer_sent_at TIMESTAMPTZ;

-- How many hours the offeree has to accept (NULL = no deadline, manually managed)
ALTER TABLE program_cohorts
  ADD COLUMN waitlist_acceptance_hours INT
    CHECK (waitlist_acceptance_hours IS NULL OR waitlist_acceptance_hours BETWEEN 1 AND 720);

CREATE INDEX idx_cohort_reg_waitlist_offer
  ON cohort_registrations (waitlist_offer_sent_at)
  WHERE status = 'pending' AND waitlist_offer_sent_at IS NOT NULL;
