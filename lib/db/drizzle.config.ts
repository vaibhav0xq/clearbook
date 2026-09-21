import { defineConfig } from "drizzle-kit";
import { existsSync } from "fs";
import path from "path";

// The repository root .env is two levels up. Existing environment values win.
const rootEnv = path.join(__dirname, "../../.env");
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // Relative to the package directory, where every script runs. drizzle-kit generate mishandles
  // absolute output paths.
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
