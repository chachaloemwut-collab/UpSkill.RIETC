export const BRAND_NAME = "UpskillReskill.RIETC";

// The two supplied collections describe different sets of events.
// A null choreography keeps the name legible beside the corresponding square artwork.
export const brandStates = {
  "hero-reveal": "pixar-dot-hop",
  "page-loading": "mexican-wave-jump",
  syncing: "magnetic-sync",
  offline: "sleepy-offline",
  maintenance: "crane-maintenance",
  "login-loading": "keyhole-unlock",
  "login-success": "login-celebrate",
  "login-error": "confused-wobble",
  logout: "wave-goodbye",
  register: "register-sprout",
  "verify-email": "envelope-zip",
  searching: "magnifying-walk",
  enrolling: "ticket-fold",
  "enroll-success": "confetti-burst",
  waitlist: "queue-march",
  "cancel-enroll": null,
  "video-loading": "equalizer-play",
  "watching-active": "heartbeat-study",
  "lesson-complete": "staircase-levelup",
  "quiz-submitting": "quiz-thinking",
  "quiz-passed": "trophy-crown",
  "quiz-retry": null,
  "cert-verifying": "laser-xray-verify",
  "cert-valid": "wax-seal-verified",
  "cert-invalid": null,
  "pdf-generating": "pdf-origami-print",
  "pdf-ready": null,
  saving: null,
  sharing: "share-paperplane",
  notification: "bell-giggle",
} as const;

export type BrandState = keyof typeof brandStates;
export type WordMotion = NonNullable<(typeof brandStates)[BrandState]>
  | "accordion-unfold" | "domino-nudge" | "typewriter-ribbon" | "night-theme-flip" | "dot-juggling";
