import { defineConfig } from "vitest/config";

// The integration suite runs only when TEST_DATABASE_URL is set (CI provides
// a throwaway Postgres); it is skipped otherwise.
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts", "src/**/*.integration.ts"],
  },
});
