import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Security-relevant rules made strict
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "react/no-danger": "error",
      "react/jsx-no-target-blank": "error",
    },
  },
  {
    // Vendored VEC UI design system: keep it byte-close to upstream. Its animation hooks deliberately read refs
    // during render and sync state in effects; those are perf/style rules, not security ones.
    files: ["src/components/ui/**", "src/lib/smart-search.ts"],
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/exhaustive-deps": "off",
      "react/display-name": "off",
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([".next/**", "next-env.d.ts"]),
]);
