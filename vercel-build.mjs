// Produces the Vercel build output for the whole app: the web app as static files and the API as
// one function that answers everything under /api. Vercel runs this through vercel.json and picks
// up .vercel/output on its own. Run it locally to inspect the result.
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, ".vercel", "output");
const functionDir = path.join(out, "functions", "api.func");

function run(command, env = {}) {
  execSync(command, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
}

rmSync(out, { recursive: true, force: true });
run("pnpm --filter @workspace/clearbook run build", { BASE_PATH: "/", PORT: "5173" });
run("pnpm --filter @workspace/api-server run build", { API_ENTRY: "src/handler.ts", API_OUT_DIR: "dist-vercel" });

mkdirSync(functionDir, { recursive: true });
cpSync(path.join(root, "artifacts", "clearbook", "dist", "public"), path.join(out, "static"), { recursive: true });
cpSync(path.join(root, "artifacts", "api-server", "dist-vercel"), functionDir, { recursive: true });

// An index run keeps working after its response is out, up to the RPC budget of 150 seconds on the
// public endpoint, so the function gets the longest duration the free plan allows.
writeFileSync(
  path.join(functionDir, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "handler.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration: 300,
    },
    null,
    2,
  ),
);

writeFileSync(
  path.join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "^/assets/(.*)$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
        { src: "^/api(?:/.*)?$", dest: "/api" },
        { handle: "filesystem" },
        { src: "^/.*$", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);

console.log(`wrote ${path.relative(root, out)}`);
