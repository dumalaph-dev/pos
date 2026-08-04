import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Supabase CLI output is a generated, minified runtime bundle.
    "supabase/.temp/**",
    // OpenNext output is generated during the deployment build.
    ".open-next/**",
    "dist/**",
    // Claude/Codex worktrees are machine-local copies, not this checkout's source.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
