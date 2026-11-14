import { describe, expect, it } from "vitest";
import { isAllowedOrigin, type Env } from "./env";

function env(allowed?: string[]): Env {
  return {
    APP_ORIGIN: "https://public.example",
    APP_ALLOWED_ORIGINS: allowed,
  } as Env;
}

describe("isAllowedOrigin", () => {
  it("accepts the canonical origin", () => {
    expect(isAllowedOrigin(env(), "https://public.example")).toBe(true);
  });

  it("accepts only explicitly configured aliases", () => {
    const configured = env(["http://localhost:3000", "http://127.0.0.1:3000"]);
    expect(isAllowedOrigin(configured, "http://localhost:3000")).toBe(true);
    expect(isAllowedOrigin(configured, "http://127.0.0.1:3000")).toBe(true);
    expect(isAllowedOrigin(configured, "https://evil.example")).toBe(false);
    expect(isAllowedOrigin(configured, null)).toBe(false);
  });
});
