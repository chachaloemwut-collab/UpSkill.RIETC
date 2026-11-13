import { pino } from "pino";

// Redact secrets/PII from every log line (cookies, tokens, passwords, API key in the URL)
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "*.password",
      "*.newPassword",
      "*.token",
      "*.stream_token",
      "*.streamToken",
      "*.code_verifier",
      "*.id_token",
      "*.access_token",
      "*.refresh_token",
      "*.key",
    ],
    censor: "[REDACTED]",
  },
});
